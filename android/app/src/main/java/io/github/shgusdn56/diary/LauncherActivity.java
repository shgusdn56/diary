package io.github.shgusdn56.diary;

import android.content.pm.PackageManager;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

// 생활일지 앱: 일지 사이트를 주소창 없이 앱 화면으로 열어요.
//  - 알림 허용은 일지에서 '이 기기에서 알림 받기'를 켤 때 휴대폰이 이 앱 이름으로 물어요(앱 안 알림 통로로 와요)
//  - 알림이 확실히 오도록 Chrome이 있으면 Chrome으로 열어요(삼성 브라우저는 설치 앱 알림이 빠지는 문제가 있었어요). 없으면 기본 브라우저로.
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
  private static final String CHROME = "com.android.chrome";

  @Override protected TwaLauncher createTwaLauncher() {
    try { getPackageManager().getPackageInfo(CHROME, 0); return new TwaLauncher(this, CHROME); }
    catch (PackageManager.NameNotFoundException e) { return super.createTwaLauncher(); }
  }
}
