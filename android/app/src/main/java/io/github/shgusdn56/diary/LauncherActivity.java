package io.github.shgusdn56.diary;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.browser.customtabs.CustomTabsClient;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import java.util.Collections;

// 생활일지 앱: 일지 사이트를 주소창 없이 앱 화면으로 열어요.
//  - 처음 열 때 휴대폰 알림 허용을 바로 물어요(안 물으면 안드로이드 13 이상에서 '차단됨'으로 남아요)
//  - Chrome이 '켜져 있고 앱 화면을 지원'하면 Chrome으로, 아니면 기본 브라우저로 열어요
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
  private static final String CHROME = "com.android.chrome";
  private String picked = "(기본)";
  private static final int REQ = 7;
  private boolean waiting;

  @Override protected void onCreate(Bundle b) {
    waiting = Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        && !getSharedPreferences("diary", MODE_PRIVATE).getBoolean("asked2", false);
    super.onCreate(b);
    if (waiting) {
      getSharedPreferences("diary", MODE_PRIVATE).edit().putBoolean("asked2", true).apply();
      requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQ);
    }
  }

  @Override protected boolean shouldLaunchImmediately() { return !waiting; }

  @Override public void onRequestPermissionsResult(int code, String[] p, int[] r) {
    super.onRequestPermissionsResult(code, p, r);
    if (code == REQ && waiting) { waiting = false; launchTwa(); }
  }

  @Override protected TwaLauncher createTwaLauncher() {
    String p = null;
    try { p = CustomTabsClient.getPackageName(this, Collections.singletonList(CHROME), true); } catch (Throwable e) {}
    if (CHROME.equals(p)) { picked = CHROME; return new TwaLauncher(this, CHROME); }
    return super.createTwaLauncher();
  }

  @Override protected void launchTwa() {
    StringBuilder d = new StringBuilder();
    try {
      try { PackageInfo ci = getPackageManager().getPackageInfo(CHROME, 0); ApplicationInfo ai = ci.applicationInfo; d.append("chrome=").append(ci.versionName).append(ai != null && ai.enabled ? " 켜짐" : " 꺼짐"); }
      catch (Throwable e) { d.append("chrome=없음"); }
      ResolveInfo r = getPackageManager().resolveActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")), 0);
      d.append(" / 기본브라우저=").append(r != null && r.activityInfo != null ? r.activityInfo.packageName : "?");
      d.append(" / 고른 것(만들기 전)=").append(picked);
    } catch (Throwable e) { d.append(" 진단오류 ").append(e); }
    try {
      super.launchTwa(); // 잘 열리면 보고하지 않아요(실패할 때만)
    } catch (Throwable e) {
      App.report("앱 열기 실패: " + e, d + "\n" + android.util.Log.getStackTraceString(e));
      throw e;
    }
  }
}
