package io.github.shgusdn56.diary;

import android.os.Build;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// 앱이 꺼지면 오류 내용(기기·안드로이드 버전·오류 줄)만 일지 서버의 문제 보고(prereports)로 보내요. 이름·메일·일지 내용은 없어요.
public class App extends android.app.Application {
  @Override public void onCreate() {
    super.onCreate();
    final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
      try {
        StringWriter sw = new StringWriter(); e.printStackTrace(new PrintWriter(sw));
        final String body = "{\"fields\":{"
            + "\"at\":{\"integerValue\":\"" + System.currentTimeMillis() + "\"},"
            + "\"ua\":" + s("android-app " + BuildConfigLite.VERSION + " / " + Build.MANUFACTURER + " " + Build.MODEL + " / Android " + Build.VERSION.RELEASE, 220) + ","
            + "\"msg\":" + s("앱이 꺼짐: " + e, 200) + ","
            + "\"errs\":" + s(sw.toString(), 900) + ","
            + "\"url\":" + s("android-app", 200) + ","
            + "\"step\":" + s("crash", 200) + "}}";
        Thread th = new Thread(() -> {
          try {
            HttpURLConnection c = (HttpURLConnection) new URL("https://firestore.googleapis.com/v1/projects/life-diary-1c3b8/databases/(default)/documents/prereports").openConnection();
            c.setRequestMethod("POST"); c.setDoOutput(true); c.setConnectTimeout(3000); c.setReadTimeout(3000);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            c.getResponseCode(); c.disconnect();
          } catch (Throwable ignore) {}
        });
        th.start(); th.join(4000);
      } catch (Throwable ignore) {}
      if (prev != null) prev.uncaughtException(t, e);
    });
  }

  private static String s(String v, int max) {
    if (v.length() > max) v = v.substring(0, max);
    StringBuilder b = new StringBuilder("{\"stringValue\":\"");
    for (char ch : v.toCharArray()) {
      if (ch == '"' || ch == '\\') b.append('\\').append(ch);
      else if (ch < 0x20) b.append(String.format("\\u%04x", (int) ch));
      else b.append(ch);
    }
    return b.append("\"}").toString();
  }
}
