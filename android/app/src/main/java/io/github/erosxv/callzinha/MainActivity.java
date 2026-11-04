package io.github.erosxv.callzinha;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        addYouTubeAdBlocker();
        addYouTubeAdCleaner();
    }

    // Bloqueio de anúncios na rede (mesma ideia do Brave e do uBlock): o pedido do anúncio é recusado antes de sair do
    // aparelho, então o player não baixa nem espera o anúncio. O limpador abaixo continua como reserva se algo escapar.
    private void addYouTubeAdBlocker() {
        try {
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    if (isAdRequest(request.getUrl())) {
                        return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked",
                            Collections.<String, String>emptyMap(), new ByteArrayInputStream(new byte[0]));
                    }
                    return super.shouldInterceptRequest(view, request);
                }
            });
        } catch (Exception e) {
            // sem o bloqueio na rede, o limpador abaixo ainda tenta tirar o anúncio
        }
    }

    private static boolean hostIs(String host, String domain) {
        return host.equals(domain) || host.endsWith("." + domain);
    }

    private static boolean isAdRequest(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        String path = uri.getPath();
        if (host == null || path == null) return false;
        if (hostIs(host, "doubleclick.net") || hostIs(host, "googlesyndication.com")
            || hostIs(host, "googleadservices.com") || hostIs(host, "2mdn.net")) return true;
        if (hostIs(host, "google.com")) return path.startsWith("/pagead/");
        if (hostIs(host, "youtube.com") || hostIs(host, "youtube-nocookie.com")) {
            return path.startsWith("/pagead/") || path.startsWith("/api/stats/ads") || path.startsWith("/ptracking")
                || path.startsWith("/get_midroll_") || path.startsWith("/youtubei/v1/player/ad_break");
        }
        return false;
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
