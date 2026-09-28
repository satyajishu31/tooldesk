package com.tooldesk.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * ToolDesk Native Capacitor Plugin.
 * 
 * Provides official Capacitor Plugin interface binding for direct MediaStore downloads.
 * Guaranteed to be initialized and registered on Capacitor.Plugins before the webview runs.
 */
@CapacitorPlugin(name = "ToolDeskNativeBridge")
public class ToolDeskNativeBridgePlugin extends Plugin {
    private ToolDeskNativeBridge bridge;

    @Override
    public void load() {
        super.load();
        bridge = new ToolDeskNativeBridge(getActivity());
    }

    @PluginMethod
    public void saveFileToDownloads(PluginCall call) {
        String base64Data = call.getString("base64Data", "");
        String cachePath = call.getString("cachePath", "");
        String filename = call.getString("filename", "tooldesk-download");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        boolean openShare = call.getBoolean("openShare", false);

        // Execute save off the main thread to ensure smooth 60fps UI
        new Thread(() -> {
            try {
                String rawJson;
                if (cachePath != null && !cachePath.trim().isEmpty()) {
                    rawJson = bridge.saveCacheFileToDownloads(cachePath, filename, mimeType);
                } else {
                    rawJson = bridge.saveFileToDownloads(base64Data, filename, mimeType, openShare);
                }

                JSONObject json = new JSONObject(rawJson);
                JSObject ret = JSObject.fromJSONObject(json);

                if (ret.optBoolean("success", false)) {
                    call.resolve(ret);
                } else {
                    call.reject(ret.optString("error", "Failed to save file to Downloads"), ret);
                }
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Native save error", e);
            }
        }).start();
    }
}
