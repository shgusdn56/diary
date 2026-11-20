package io.github.shgusdn56.diary;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
public class LaunchTest {
  @Test @Config(sdk = 34) public void opens34() { Robolectric.buildActivity(LauncherActivity.class).setup(); }
  @Test @Config(sdk = 30) public void opens30() { Robolectric.buildActivity(LauncherActivity.class).setup(); }
}
