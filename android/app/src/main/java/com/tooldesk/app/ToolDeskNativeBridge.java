package com.tooldesk.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * ToolDesk Native Android File Download and Share Bridge.
 * 
 * Provides direct, zero-compromise file saving to Android's public Downloads directory
 * using MediaStore.Downloads (API 29+) or legacy external storage (API <29).
 * 
 * Guarantees that:
 * 1. Output files are actually written to disk in Downloads/ToolDesk.
 * 2. MediaScanner indexes the file so it appears instantly in file managers and Downloads.
 * 3. A native Android Toast confirms the save location.
 * 4. An optional Share / Open intent can be triggered with granted FileProvider permissions.
 * 5. Returns a structured JSON result to Javascript (success/path/error).
 */
public class ToolDeskNativeBridge {
    private final Activity activity;

    public ToolDeskNativeBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String saveFileToDownloads(String base64Data, String filename, String mimeType, boolean openShare) {
        try {
            if (base64Data == null || base64Data.trim().isEmpty()) {
                return "{\"success\":false,\"error\":\"Binary data is empty\"}";
            }

            // Strip data: URI header if present
            String cleanB64 = base64Data;
            if (cleanB64.contains(",")) {
                cleanB64 = cleanB64.substring(cleanB64.indexOf(",") + 1);
            }
            cleanB64 = cleanB64.replaceAll("\\s+", "");

            byte[] bytes = Base64.decode(cleanB64, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) {
                return "{\"success\":false,\"error\":\"Failed to decode binary content\"}";
            }

            String safeName = (filename == null || filename.trim().isEmpty()) ? "tooldesk-download" : filename.trim();
            safeName = safeName.replaceAll("[/\\\\?%*:|\"<>]+", "_");

            String safeMime = (mimeType == null || mimeType.trim().isEmpty()) ? "application/octet-stream" : mimeType.trim();

            Uri fileUri = null;
            File targetFile = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ToolDesk");
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                ContentResolver resolver = activity.getContentResolver();
                fileUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                if (fileUri == null) {
                    return "{\"success\":false,\"error\":\"Could not create MediaStore entry in Downloads\"}";
                }

                try (OutputStream os = resolver.openOutputStream(fileUri)) {
                    if (os == null) {
                        return "{\"success\":false,\"error\":\"Could not open MediaStore output stream\"}";
                    }
                    os.write(bytes);
                    os.flush();
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(fileUri, values, null, null);
            } else {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File toolDeskDir = new File(downloadsDir, "ToolDesk");
                if (!toolDeskDir.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    toolDeskDir.mkdirs();
                }
                targetFile = new File(toolDeskDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(bytes);
                    fos.flush();
                }

                MediaScannerConnection.scanFile(
                    activity,
                    new String[]{targetFile.getAbsolutePath()},
                    new String[]{safeMime},
                    null
                );

                try {
                    fileUri = FileProvider.getUriForFile(
                        activity,
                        activity.getPackageName() + ".fileprovider",
                        targetFile
                    );
                } catch (Exception e) {
                    fileUri = Uri.fromFile(targetFile);
                }
            }

            final String displayName = safeName;
            activity.runOnUiThread(() -> {
                try {
                    Toast.makeText(activity, "✓ Saved " + displayName + " to Downloads/ToolDesk", Toast.LENGTH_LONG).show();
                } catch (Exception ignored) {}
            });

            if (openShare && fileUri != null) {
                final Uri shareUri = fileUri;
                activity.runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_SEND);
                        intent.setType(safeMime);
                        intent.putExtra(Intent.EXTRA_STREAM, shareUri);
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        Intent chooser = Intent.createChooser(intent, "Share " + displayName);
                        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(chooser);
                    } catch (Exception ignored) {}
                });
            }

            return "{\"success\":true,\"filename\":\"" + safeName + "\",\"path\":\"Downloads/ToolDesk/" + safeName + "\"}";
        } catch (Exception e) {
            return "{\"success\":false,\"error\":\"" + e.getMessage().replace("\"", "\\\"") + "\"}";
        }
    }
}
