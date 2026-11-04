import fs from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  let xml = fs.readFileSync(manifestPath, 'utf8');
  const perms = [
    '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.VIBRATE" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />'
  ];
  for (const p of perms) {
    const name = p.match(/android:name="([^"]+)"/)[1];
    if (!xml.includes(name)) {
      xml = xml.replace('</manifest>', `    ${p}\n</manifest>`);
    }
  }
  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log('Patched AndroidManifest.xml with background location & notification permissions.');
}
