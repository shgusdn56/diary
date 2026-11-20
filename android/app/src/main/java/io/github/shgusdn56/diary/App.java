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
        Throwable root = e; while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        // 오류 사슬 전체를 짧게: 각 단계의 종류·내용과 앞쪽 4줄 (가운데 진짜 원인이 잘리지 않게)
        StringWriter sw = new StringWriter(); int depth = 0;
        for (Throwable x = e; x != null && depth < 6; x = (x.getCause() == x ? null : x.getCause()), depth++) {
          String m = String.valueOf(x); if (m.length() > 160) m = m.substring(0, 160);
          sw.append("#").append(String.valueOf(depth)).append(" ").append(m).append("\n");
          StackTraceElement[] st = x.getStackTrace();
          for (int i = 0; i < Math.min(4, st.length); i++) { String f = String.valueOf(st[i]); sw.append("  @").append(f.length() > 110 ? f.substring(0, 110) : f).append("\n"); }
        }
        final String body = "{\"fields\":{"
            + "\"at\":{\"integerValue\":\"" + System.currentTimeMillis() + "\"},"
            + "\"ua\":" + s("android-app " + BuildConfigLite.VERSION + " / " + Build.MANUFACTURER + " " + Build.MODEL + " / Android " + Build.VERSION.RELEASE, 220) + ","
            + "\"msg\":" + s("앱이 꺼짐: " + root, 200) + ","
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

  // 꺼지지 않는 문제(열자마자 홈으로 돌아감 등)를 찾으려고 여는 과정을 보고해요
  static void report(String msg, String errs) {
    final String body = "{\"fields\":{"
        + "\"at\":{\"integerValue\":\"" + System.currentTimeMillis() + "\"},"
        + "\"ua\":" + s("android-app " + BuildConfigLite.VERSION + " / " + Build.MANUFACTURER + " " + Build.MODEL + " / Android " + Build.VERSION.RELEASE, 220) + ","
        + "\"msg\":" + s(msg, 200) + ","
        + "\"errs\":" + s(errs, 900) + ","
        + "\"url\":" + s("android-app", 200) + ","
        + "\"step\":" + s("launch", 200) + "}}";
    new Thread(() -> {
      try {
        HttpURLConnection c = (HttpURLConnection) new URL("https://firestore.googleapis.com/v1/projects/life-diary-1c3b8/databases/(default)/documents/prereports").openConnection();
        c.setRequestMethod("POST"); c.setDoOutput(true); c.setConnectTimeout(5000); c.setReadTimeout(5000);
        c.setRequestProperty("Content-Type", "application/json");
        try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        c.getResponseCode(); c.disconnect();
      } catch (Throwable ignore) {}
    }).start();
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
