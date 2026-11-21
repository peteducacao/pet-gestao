package br.ufs.peteducacao.gestao;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebResourceResponse;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.util.UUID;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String HOME = "https://peteducacao.github.io/pet-gestao/#/inicio";
    private static final int PICK_FILE_REQUEST = 1938;
    private static final int PUSH_PERMISSION_REQUEST = 1706;
    private static final String PUSH_CHANNEL = "pet_gestao_avisos";
    private String currentPushToken = null;
    private boolean trustedPageReady = false;
    private WebView webView;
    private ValueCallback<Uri[]> pendingFileSelection;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(100, 0, 168));
        getWindow().setNavigationBarColor(Color.rgb(43, 0, 74));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(250, 247, 255));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equalsIgnoreCase(scheme)
                        && "peteducacao.github.io".equalsIgnoreCase(uri.getHost())
                        && uri.getPath() != null
                        && (uri.getPath().equals("/pet-gestao") || uri.getPath().startsWith("/pet-gestao/"))) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                trustedPageReady = isTrustedSite(url);
                publishPushToken();
                // A WebView pode terminar de carregar antes do script defer da interface.
                view.postDelayed(() -> publishPushToken(), 900);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this,
                            "Se o site não abrir, verifique a conexão com a internet.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (pendingFileSelection != null) pendingFileSelection.onReceiveValue(null);
                pendingFileSelection = filePathCallback;
                try {
                    startActivityForResult(fileChooserParams.createIntent(), PICK_FILE_REQUEST);
                    return true;
                } catch (ActivityNotFoundException ex) {
                    pendingFileSelection = null;
                    filePathCallback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Nenhum seletor de arquivos disponível.",
                            Toast.LENGTH_SHORT).show();
                    return true;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri uri = Uri.parse(url);
            if ("https".equalsIgnoreCase(uri.getScheme())) openExternal(uri);
        });

        createNotificationChannel();
        initializePush();

        // Notificações têm prioridade sobre a restauração de páginas antigas.
        String launchRoute = safePushRoute(getIntent().getStringExtra("pet_route"));
        if (launchRoute != null) {
            webView.loadUrl("https://peteducacao.github.io/pet-gestao/#" + launchRoute);
        } else if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME);
        }
    }

    private boolean isTrustedSite(String url) {
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        return "https".equalsIgnoreCase(uri.getScheme())
                && "peteducacao.github.io".equalsIgnoreCase(uri.getHost())
                && path != null
                && (path.equals("/pet-gestao") || path.startsWith("/pet-gestao/"));
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(PUSH_CHANNEL,
                    "Demandas e prazos", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Novas demandas, prazos próximos e atrasos do PET Gestão");
            channel.enableVibration(true);
            NotificationManager manager = (NotificationManager)
                    getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void initializePush() {
        // Sem google-services.json, o APK de testes continua funcional,
        // mas não promete receber mensagens do Firebase.
        if (FirebaseApp.getApps(this).isEmpty()) return;
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    PUSH_PERMISSION_REQUEST);
        } else {
            loadPushToken();
        }
    }

    private void loadPushToken() {
        if (FirebaseApp.getApps(this).isEmpty()) return;
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) return;
        // Atualiza o token na próxima abertura caso o Firebase o tenha renovado.
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(value -> {
            if (value == null || value.isEmpty()) return;
            currentPushToken = value;
            publishPushToken();
        });
    }

    private void publishPushToken() {
        if (!trustedPageReady || webView == null || currentPushToken == null) return;
        final String deviceId = getSharedPreferences("pet_push", MODE_PRIVATE)
                .getString("device_id", "");
        String id = deviceId;
        if (id.isEmpty()) {
            id = UUID.randomUUID().toString();
            getSharedPreferences("pet_push", MODE_PRIVATE).edit()
                    .putString("device_id", id).apply();
        }
        final String code = "window.petGestaoPushToken && window.petGestaoPushToken("
                + JSONObject.quote(currentPushToken) + ","
                + JSONObject.quote(id) + ");";
        webView.evaluateJavascript(code, null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions,
                                           int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PUSH_PERMISSION_REQUEST && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) loadPushToken();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) loadPushToken();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) {
            String route = intent.getStringExtra("pet_route");
            String destination = safePushRoute(route);
            if (destination != null) webView.loadUrl(
                    "https://peteducacao.github.io/pet-gestao/#" + destination);
        }
    }

    private static String safePushRoute(String route) {
        if (route == null || !route.matches("^(/inicio|/minhas-pendencias|/meus-lembretes|/atividade/[A-Za-z0-9_-]{1,100})$"))
            return null;
        return route;
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme)
                && !"http".equalsIgnoreCase(scheme)
                && !"mailto".equalsIgnoreCase(scheme)
                && !"tel".equalsIgnoreCase(scheme)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ex) {
            Toast.makeText(this, "Nenhum aplicativo pode abrir este link.",
                    Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE_REQUEST && pendingFileSelection != null) {
            pendingFileSelection.onReceiveValue(
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFileSelection = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingFileSelection != null) {
            pendingFileSelection.onReceiveValue(null);
            pendingFileSelection = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
