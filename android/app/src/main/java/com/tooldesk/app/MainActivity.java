package com.tooldesk.app;

import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    private static final long MAX_SHARE_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    private final Set<String> processedIntentHashes = new HashSet<>();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native bridge plugin BEFORE super.onCreate so it is bound into Capacitor from frame 0
        registerPlugin(ToolDeskNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Ensure edge-to-edge layout is active and properly dispatch insets to WebView
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            int topDp = Math.round(insets.top / density);
            int bottomDp = Math.round(insets.bottom / density);
            int leftDp = Math.round(insets.left / density);
            int rightDp = Math.round(insets.right / density);

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    String js = String.format(
                        java.util.Locale.US,
                        "document.documentElement.style.setProperty('--safe-area-inset-top', '%dpx');" +
                        "document.documentElement.style.setProperty('--safe-area-inset-bottom', '%dpx');" +
                        "document.documentElement.style.setProperty('--safe-area-inset-left', '%dpx');" +
                        "document.documentElement.style.setProperty('--safe-area-inset-right', '%dpx');",
                        topDp, bottomDp, leftDp, rightDp
                    );
                    getBridge().getWebView().evaluateJavascript(js, null);
                });
            }
            return windowInsets;
        });

        // Ensure WebView cache is wiped when upgrading to v1.3.0 (versionCode 13000) or on fresh install
        try {
            android.content.SharedPreferences prefs = getSharedPreferences("tooldesk_meta", MODE_PRIVATE);
            int lastVersion = prefs.getInt("last_version_code", -1);
            if (lastVersion < 13000) {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().clearCache(true);
                }
                prefs.edit().putInt("last_version_code", 13000).apply();
            }
        } catch (Exception ignored) {}

        registerNativeInterface();
        handleIncomingIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        registerNativeInterface();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void registerNativeInterface() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            try {
                getBridge().getWebView().addJavascriptInterface(new ToolDeskNativeBridge(this), "ToolDeskNativeBridge");
            } catch (Exception ignored) {}
        }
    }

    /**
     * Extracts incoming files from ACTION_SEND, ACTION_SEND_MULTIPLE, and ACTION_VIEW intents.
     * Sanitizes filenames, applies size bounds, buffers to secure app cache, and notifies WebView.
     */
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        if (!Intent.ACTION_SEND.equals(action) &&
            !Intent.ACTION_SEND_MULTIPLE.equals(action) &&
            !Intent.ACTION_VIEW.equals(action)) {
            return;
        }

        // Avoid re-processing the same intent instance on orientation changes
        String intentKey = action + "_" + intent.getDataString() + "_" + intent.hashCode();
        if (processedIntentHashes.contains(intentKey)) {
            return;
        }
        processedIntentHashes.add(intentKey);

        // Run off main thread to prevent UI freezing during file I/O
        new Thread(() -> {
            try {
                cleanOldShareCache();

                List<Uri> targetUris = new ArrayList<>();

                if (Intent.ACTION_SEND.equals(action)) {
                    Uri singleUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (singleUri == null) singleUri = intent.getData();
                    if (singleUri != null) targetUris.add(singleUri);
                } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                    ArrayList<Uri> uriList = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                    if (uriList != null) targetUris.addAll(uriList);
                } else if (Intent.ACTION_VIEW.equals(action)) {
                    Uri viewUri = intent.getData();
                    if (viewUri != null) targetUris.add(viewUri);
                }

                // Check ClipData for supplementary or missed items
                ClipData clipData = intent.getClipData();
                if (clipData != null) {
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        ClipData.Item item = clipData.getItemAt(i);
                        if (item != null && item.getUri() != null && !targetUris.contains(item.getUri())) {
                            targetUris.add(item.getUri());
                        }
                    }
                }

                if (targetUris.isEmpty()) return;

                File shareDir = new File(getCacheDir(), "inbound_shares");
                if (!shareDir.exists()) shareDir.mkdirs();

                JSONArray parsedFilesArray = new JSONArray();

                for (Uri uri : targetUris) {
                    if (uri == null) continue;
                    try {
                        try {
                            grantUriPermission(getPackageName(), uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        } catch (Exception ignored) {}

                        String rawName = null;
                        long reportedSize = 0;

                        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                            if (cursor != null && cursor.moveToFirst()) {
                                int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                                int sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE);
                                if (nameIdx != -1) rawName = cursor.getString(nameIdx);
                                if (sizeIdx != -1) reportedSize = cursor.getLong(sizeIdx);
                            }
                        } catch (Exception ignored) {}

                        String mime = getContentResolver().getType(uri);
                        if (mime == null || mime.trim().isEmpty()) {
                            mime = "application/octet-stream";
                        }

                        // Sanitize filename against path traversal
                        String safeName = rawName != null ? rawName : uri.getLastPathSegment();
                        if (safeName == null || safeName.trim().isEmpty()) {
                            safeName = "shared_file_" + System.currentTimeMillis();
                        }
                        safeName = safeName.replaceAll("[/\\\\?%*:|\"<>\\x00-\\x1f]", "_").trim();
                        if (safeName.isEmpty()) {
                            safeName = "shared_file_" + System.currentTimeMillis();
                        }

                        // Size limit check
                        if (reportedSize > MAX_SHARE_FILE_SIZE) {
                            continue; // skip files larger than 100MB
                        }

                        File destFile = new File(shareDir, System.currentTimeMillis() + "_" + safeName);
                        long totalCopied = 0;
                        ByteArrayOutputStream memoryBuffer = new ByteArrayOutputStream();

                        try (InputStream in = getContentResolver().openInputStream(uri);
                             FileOutputStream out = new FileOutputStream(destFile)) {
                            if (in == null) continue;
                            byte[] buffer = new byte[16384];
                            int read;
                            while ((read = in.read(buffer)) != -1) {
                                totalCopied += read;
                                if (totalCopied > MAX_SHARE_FILE_SIZE) {
                                    throw new IllegalStateException("File exceeded 100MB limit");
                                }
                                out.write(buffer, 0, read);
                                if (totalCopied <= 10 * 1024 * 1024) { // Only buffer in memory if <= 10MB
                                    memoryBuffer.write(buffer, 0, read);
                                }
                            }
                        }

                        JSONObject fileInfo = new JSONObject();
                        fileInfo.put("name", safeName);
                        fileInfo.put("size", totalCopied);
                        fileInfo.put("mimeType", mime);
                        fileInfo.put("cachePath", destFile.getAbsolutePath());

                        if (totalCopied <= 10 * 1024 * 1024 && memoryBuffer.size() > 0) {
                            String b64 = Base64.encodeToString(memoryBuffer.toByteArray(), Base64.NO_WRAP);
                            fileInfo.put("dataUrl", "data:" + mime + ";base64," + b64);
                        } else {
                            fileInfo.put("dataUrl", "");
                        }

                        ToolDeskNativeBridge.addPendingSharedFile(fileInfo);
                        parsedFilesArray.put(fileInfo);
                    } catch (Exception fileErr) {
                        // Skip unreadable item
                    }
                }

                if (parsedFilesArray.length() > 0) {
                    runOnUiThread(() -> {
                        if (getBridge() != null && getBridge().getWebView() != null) {
                            getBridge().getWebView().post(() -> {
                                String js = "window.dispatchEvent(new CustomEvent('tooldesk-inbound-share', { detail: " + parsedFilesArray.toString() + " }));";
                                getBridge().getWebView().evaluateJavascript(js, null);
                            });
                        }
                    });
                }
            } catch (Exception e) {
                // Log or ignore
            }
        }).start();
    }

    /**
     * Purges temporary shares older than 1 hour to prevent cache bloat
     */
    private void cleanOldShareCache() {
        try {
            File shareDir = new File(getCacheDir(), "inbound_shares");
            if (shareDir.exists() && shareDir.isDirectory()) {
                File[] files = shareDir.listFiles();
                if (files != null) {
                    long now = System.currentTimeMillis();
                    long oneHour = 3600000L;
                    for (File f : files) {
                        if (now - f.lastModified() > oneHour) {
                            f.delete();
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
    }
}
