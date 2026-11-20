package br.ufs.peteducacao.gestao;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class AppPushMessagingService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // A associação à conta depende da sessão autenticada na WebView.
        // O novo token será associado na próxima abertura do aplicativo.
        getSharedPreferences("pet_push", MODE_PRIVATE).edit()
                .putString("latest_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        final java.util.Map<String, String> data = remoteMessage.getData();
        String title = data.get("title"), body = data.get("body"), route = data.get("route");
        if (title == null || title.trim().isEmpty()) title = "PET Gestão";
        if (body == null) body = "Você tem uma atualização.";
        if (title.length() > 90) title = title.substring(0, 90);
        if (body.length() > 220) body = body.substring(0, 220);
        if (route == null || !route.matches("^(/inicio|/atividade/[A-Za-z0-9-]{1,100})$")) route = null;

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP |
                        Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (route != null) intent.putExtra("pet_route", route);
        int requestCode = (int) (System.currentTimeMillis() & 0x7FFFFFFF);
        PendingIntent pending = PendingIntent.getActivity(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, "pet_gestao_avisos")
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setColor(Color.rgb(103, 38, 184))
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(pending);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(requestCode, builder.build());
    }
}
