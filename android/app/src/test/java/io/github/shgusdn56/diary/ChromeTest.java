package io.github.shgusdn56.diary;

import android.content.ComponentName;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowPackageManager;

@RunWith(RobolectricTestRunner.class)
public class ChromeTest {
  @Test @Config(sdk = 35) public void withChrome() {
    android.content.Context c = ApplicationProvider.getApplicationContext();
    ShadowPackageManager pm = Shadows.shadowOf(c.getPackageManager());
    PackageInfo pi = new PackageInfo(); pi.packageName = "com.android.chrome"; pi.versionName = "140"; pi.applicationInfo = new android.content.pm.ApplicationInfo(); pi.applicationInfo.packageName = pi.packageName;
    pm.installPackage(pi);
    ComponentName svc = new ComponentName("com.android.chrome", "org.chromium.chrome.browser.customtabs.CustomTabsConnectionService");
    pm.addServiceIfNotPresent(svc);
    IntentFilter f = new IntentFilter("android.support.customtabs.action.CustomTabsService");
    f.addCategory("androidx.browser.trusted.category.TrustedWebActivities");
    f.addCategory("androidx.browser.trusted.category.WebShareTargetV2");
    f.addCategory("androidx.browser.trusted.category.ImmersiveMode");
    f.addCategory("androidx.browser.trusted.category.LaunchWebApkSplashScreen");
    pm.addIntentFilterForService(svc, f);
    Robolectric.buildActivity(LauncherActivity.class).setup();
  }
}
