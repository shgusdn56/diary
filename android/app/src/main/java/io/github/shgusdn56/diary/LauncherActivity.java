package io.github.shgusdn56.diary;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

// 생활일지 앱: 일지 사이트를 주소창 없이 앱 화면으로 열어요.
//  - 처음 열 때 휴대폰 알림 허용을 바로 물어요(안드로이드 13 이상은 앱마다 허용이 필요해서, 안 물으면 '차단됨'으로 남아요)
//  - 알림이 확실히 오도록 Chrome이 있으면 Chrome으로 열어요(삼성 브라우저는 설치 앱 알림이 빠지는 문제가 있었어요). 없으면 기본 브라우저로.
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
  private static final int REQ = 7;
  private static final String CHROME = "com.android.chrome";
  private boolean waiting;

  @Override protected void onCreate(Bundle b) {
    waiting = Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        && !getSharedPreferences("diary", MODE_PRIVATE).getBoolean("asked", false);
    super.onCreate(b);
    if (waiting) {
      getSharedPreferences("diary", MODE_PRIVATE).edit().putBoolean("asked", true).apply();
      requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ);
    }
  }

  @Override protected boolean shouldLaunchImmediately() { return !waiting; }

  @Override public void onRequestPermissionsResult(int code, String[] p, int[] r) {
    super.onRequestPermissionsResult(code, p, r);
    if (code == REQ && waiting) { waiting = false; launchTwa(); }
  }

  @Override protected TwaLauncher createTwaLauncher() {
    try { getPackageManager().getPackageInfo(CHROME, 0); return new TwaLauncher(this, CHROME); }
    catch (PackageManager.NameNotFoundException e) { return super.createTwaLauncher(); }
  }
}
