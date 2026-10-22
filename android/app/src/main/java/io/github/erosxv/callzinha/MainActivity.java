package io.github.erosxv.callzinha;

import android.os.Bundle;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        addYouTubeAdCleaner();
    }

    // Tira os anúncios do player do YouTube: roda o yt-noads.js dentro dos players (só nos endereços do YouTube),
    // antes de qualquer código deles. Aparelho com WebView antigo sem esse recurso: segue com anúncio, sem quebrar nada.
    private void addYouTubeAdCleaner() {
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
            String js;
            try (InputStream in = getAssets().open("public/yt-noads.js")) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                js = new String(out.toByteArray(), StandardCharsets.UTF_8);
            }
            WebViewCompat.addDocumentStartJavaScript(bridge.getWebView(), js, new HashSet<>(Arrays.asList(
                "https://www.youtube.com", "https://youtube.com", "https://m.youtube.com",
                "https://www.youtube-nocookie.com", "https://youtube-nocookie.com")));
        } catch (Exception e) {
            // sem o limpador, o vídeo só volta a ter anúncio
        }
    }
}
