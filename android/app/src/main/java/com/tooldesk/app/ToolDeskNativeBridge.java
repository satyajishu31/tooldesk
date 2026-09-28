package com.tooldesk.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * ToolDesk Native Android File Download and Save Bridge.
 * 
 * Guarantees direct save to Android's public Downloads directory
 * (Downloads/ToolDesk/) using MediaStore.Downloads (API 29+) or public external storage (API <29).
 * 
 * Download action strictly writes directly to Downloads/ToolDesk without opening the Share Sheet.
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

            return saveStreamToDownloads(new ByteArrayInputStream(bytes), bytes.length, filename, mimeType, openShare, null);
        } catch (Exception e) {
            return "{\"success\":false,\"error\":\"" + (e.getMessage() != null ? e.getMessage().replace("\"", "\\\"") : "Error processing data") + "\"}";
        }
    }

    @JavascriptInterface
    public String saveCacheFileToDownloads(String cacheFilePath, String filename, String mimeType) {
        try {
            if (cacheFilePath == null || cacheFilePath.trim().isEmpty()) {
                return "{\"success\":false,\"error\":\"Cache file path is empty\"}";
            }

            String cleanPath = cacheFilePath.trim();
            if (cleanPath.startsWith("file://")) {
                cleanPath = cleanPath.substring(7);
            }

            File sourceFile = new File(cleanPath);
            if (!sourceFile.exists() || !sourceFile.canRead()) {
                return "{\"success\":false,\"error\":\"Cache file does not exist or cannot be read: " + cleanPath.replace("\"", "\\\"") + "\"}";
            }

            long totalBytes = sourceFile.length();
            try (FileInputStream fis = new FileInputStream(sourceFile)) {
                return saveStreamToDownloads(fis, totalBytes, filename, mimeType, false, sourceFile);
            }
        } catch (Exception e) {
            return "{\"success\":false,\"error\":\"" + (e.getMessage() != null ? e.getMessage().replace("\"", "\\\"") : "Error processing cache file") + "\"}";
        }
    }

    private String saveStreamToDownloads(InputStream inputStream, long expectedSize, String filename, String mimeType, boolean openShare, File tempFileToDelete) {
        try {
            String safeName = (filename == null || filename.trim().isEmpty()) ? "tooldesk-download" : filename.trim();
            safeName = safeName.replaceAll("[/\\\\?%*:|\"<>]+", "_");

            String safeMime = (mimeType == null || mimeType.trim().isEmpty()) ? "application/octet-stream" : mimeType.trim();

            Uri fileUri = null;
            File targetFile = null;
            long writtenBytes = 0;

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
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = inputStream.read(buffer)) != -1) {
                        os.write(buffer, 0, read);
                        writtenBytes += read;
                    }
                    os.flush();
                }

                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(fileUri, values, null, null);

                // Verify written file size via openFileDescriptor
                try (ParcelFileDescriptor pfd = resolver.openFileDescriptor(fileUri, "r")) {
                    if (pfd != null && pfd.getStatSize() > 0) {
                        writtenBytes = pfd.getStatSize();
                    }
                } catch (Exception ignored) {}
            } else {
                File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File toolDeskDir = new File(downloadsDir, "ToolDesk");
                if (!toolDeskDir.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    toolDeskDir.mkdirs();
                }
                targetFile = new File(toolDeskDir, safeName);
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = inputStream.read(buffer)) != -1) {
                        fos.write(buffer, 0, read);
                        writtenBytes += read;
                    }
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

            // Cleanup temp cache file if one was used
            if (tempFileToDelete != null && tempFileToDelete.exists()) {
                try {
                    //noinspection ResultOfMethodCallIgnored
                    tempFileToDelete.delete();
                } catch (Exception ignored) {}
            }

            // Verify non-zero byte size
            if (writtenBytes <= 0 && expectedSize > 0) {
                JSONObject err = new JSONObject();
                err.put("success", false);
                err.put("error", "No bytes written to file");
                return err.toString();
            }

            final String displayName = safeName;
            activity.runOnUiThread(() -> {
                try {
                    Toast.makeText(activity, "✓ Saved " + displayName + " to Downloads/ToolDesk", Toast.LENGTH_LONG).show();
                } catch (Exception ignored) {}
            });

            // Only trigger share if explicitly requested via openShare parameter (NEVER on standard download)
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

            JSONObject json = new JSONObject();
            json.put("success", true);
            json.put("filename", safeName);
            json.put("path", "Downloads/ToolDesk/" + safeName);
            json.put("uri", fileUri != null ? fileUri.toString() : "");
            json.put("size", writtenBytes);
            json.put("mimeType", safeMime);
            return json.toString();
        } catch (Exception e) {
            JSONObject err = new JSONObject();
            try {
                err.put("success", false);
                err.put("error", e.getMessage() != null ? e.getMessage() : "Error writing file");
            } catch (Exception ignored) {}
            return err.toString();
        }
    }
}
