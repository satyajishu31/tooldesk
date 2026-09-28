package com.tooldesk.app;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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

        registerNativeBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        registerNativeBridge();
    }

    private void registerNativeBridge() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> {
                try {
                    getBridge().getWebView().addJavascriptInterface(new ToolDeskNativeBridge(this), "ToolDeskNativeBridge");
                } catch (Exception ignored) {}
            });
        }
    }
}
