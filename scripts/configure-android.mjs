import fs from 'node:fs';
import path from 'node:path';

// 1. Patch AndroidManifest.xml with Location, Notification, Overlay (SYSTEM_ALERT_WINDOW), and PiP attributes
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
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
    '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />'
  ];
  for (const p of perms) {
    const name = p.match(/android:name="([^"]+)"/)[1];
    if (!xml.includes(name)) {
      xml = xml.replace('</manifest>', `    ${p}\n</manifest>`);
    }
  }

  // Enable supportsPictureInPicture on MainActivity tag if not already present
  if (!xml.includes('android:supportsPictureInPicture')) {
    xml = xml.replace(
      /<activity([^>]*android:name="[^"]*MainActivity"[^>]*)>/,
      '<activity$1 android:supportsPictureInPicture="true">'
    );
  }

  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log('Patched AndroidManifest.xml with SYSTEM_ALERT_WINDOW (overlay), background location & notification permissions.');
}

// 2. Locate MainActivity.java and inject FloatingOverlayManager.java + WebView JavascriptInterface ("AndroidOverlay")
function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(fullPath);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') {
      return fullPath;
    }
  }
  return null;
}

const javaRoot = 'android/app/src/main/java';
const mainActivityPath = findMainActivity(javaRoot) || 'android/app/src/main/java/com/nkids/entercoding/delivery/MainActivity.java';

if (fs.existsSync(path.dirname(mainActivityPath))) {
  let pkgName = 'com.nkids.entercoding.delivery';
  if (fs.existsSync(mainActivityPath)) {
    const existingMain = fs.readFileSync(mainActivityPath, 'utf8');
    const m = existingMain.match(/package\s+([a-zA-Z0-9_.]+)\s*;/);
    if (m) pkgName = m[1];
  }

  const pkgDir = path.dirname(mainActivityPath);
  const overlayJavaPath = path.join(pkgDir, 'FloatingOverlayManager.java');

  const overlayJavaCode = `package ${pkgName};

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

public class FloatingOverlayManager {
    private final Activity activity;
    private final Context appContext;
    private final WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private WindowManager.LayoutParams layoutParams;
    private LinearLayout rootContainer;
    private LinearLayout bodyContainer;
    private LinearLayout itemsContainer;
    private TextView badgeView;
    private TextView distView;
    private TextView collapseBtn;
    private TextView titleView;
    private TextView progressView;
    private boolean isShowing = false;
    private boolean isCollapsed = false;
    private String lastPayloadJson = "{}";
    private String currentNaviUrl = "";
    private String currentWebNaviUrl = "";

    public FloatingOverlayManager(Activity activity, WebView webView) {
        this.activity = activity;
        this.appContext = activity.getApplicationContext();
        this.webView = webView;
        this.windowManager = (WindowManager) this.appContext.getSystemService(Context.WINDOW_SERVICE);
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            v,
            appContext.getResources().getDisplayMetrics()
        );
    }

    private GradientDrawable makeBg(String fillHex, int cornerDp, String strokeHex, int strokeDp) {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(Color.parseColor(fillHex));
        gd.setCornerRadius(dp(cornerDp));
        if (strokeDp > 0 && strokeHex != null) {
            gd.setStroke(dp(strokeDp), Color.parseColor(strokeHex));
        }
        return gd;
    }

    private void evalJs(final String script) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(script, null);
                    } else {
                        webView.loadUrl("javascript:" + script);
                    }
                }
            }
        });
    }

    private void launchNaviIntent(String naviUrl, String webUrl) {
        try {
            if (naviUrl != null && naviUrl.length() > 0) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(naviUrl));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                appContext.startActivity(intent);
                return;
            }
        } catch (Exception e) {
            try {
                if (webUrl != null && webUrl.length() > 0) {
                    Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    appContext.startActivity(fallback);
                    return;
                }
            } catch (Exception ex) {
                ex.printStackTrace();
            }
        }
    }

    @JavascriptInterface
    public boolean isSupported() {
        return true;
    }

    @JavascriptInterface
    public void forceRefreshFromServer() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) {
                    webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
                    webView.clearCache(false);
                    webView.loadUrl("https://n-kids.github.io/entercoding-delivery/?v=" + System.currentTimeMillis());
                }
            }
        });
    }

    @JavascriptInterface
    public boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        return Settings.canDrawOverlays(appContext);
    }

    @JavascriptInterface
    public void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(appContext)) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + appContext.getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            appContext.startActivity(intent);
        }
    }

    @JavascriptInterface
    public void launchNaverNavi(final String naviUrl, final String webUrl) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                launchNaviIntent(naviUrl, webUrl);
            }
        });
    }

    @JavascriptInterface
    public boolean isOverlayShowing() {
        return isShowing;
    }

    @JavascriptInterface
    public void showOverlay(final String jsonPayload) {
        lastPayloadJson = jsonPayload != null ? jsonPayload : "{}";
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (!canDrawOverlays()) {
                    requestOverlayPermission();
                    return;
                }
                ensureViewCreated();
                if (!isShowing) {
                    try {
                        windowManager.addView(rootContainer, layoutParams);
                        isShowing = true;
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                renderPayload(lastPayloadJson);
            }
        });
    }

    @JavascriptInterface
    public void updateOverlay(final String jsonPayload) {
        lastPayloadJson = jsonPayload != null ? jsonPayload : "{}";
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (isShowing && rootContainer != null) {
                    renderPayload(lastPayloadJson);
                }
            }
        });
    }

    @JavascriptInterface
    public void hideOverlay() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (isShowing && rootContainer != null && windowManager != null) {
                    try {
                        windowManager.removeView(rootContainer);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                    isShowing = false;
                }
            }
        });
    }

    private void triggerStartNaviFromOverlay() {
        evalJs("window.onNativeOverlayStartNavi && window.onNativeOverlayStartNavi(false);");
        launchNaviIntent(currentNaviUrl, currentWebNaviUrl);
    }

    private void ensureViewCreated() {
        if (rootContainer != null) return;

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        layoutParams = new WindowManager.LayoutParams(
            dp(296),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            android.graphics.PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.x = dp(12);
        layoutParams.y = dp(90);

        rootContainer = new LinearLayout(appContext);
        rootContainer.setOrientation(LinearLayout.VERTICAL);
        rootContainer.setPadding(dp(12), dp(10), dp(12), dp(10));
        rootContainer.setBackground(makeBg("#EB0F172A", 16, "#10B981", 2));

        // Header Bar (Draggable)
        LinearLayout headerBar = new LinearLayout(appContext);
        headerBar.setOrientation(LinearLayout.HORIZONTAL);
        headerBar.setGravity(Gravity.CENTER_VERTICAL);

        badgeView = new TextView(appContext);
        badgeView.setText("🧭 내비고정");
        badgeView.setTextColor(Color.WHITE);
        badgeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        badgeView.setTypeface(null, Typeface.BOLD);
        badgeView.setPadding(dp(7), dp(3), dp(7), dp(3));
        badgeView.setBackground(makeBg("#059669", 8, null, 0));
        headerBar.addView(badgeView);

        distView = new TextView(appContext);
        distView.setText("거리 계산중");
        distView.setTextColor(Color.parseColor("#38BDF8"));
        distView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        distView.setTypeface(null, Typeface.BOLD);
        LinearLayout.LayoutParams distLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        distLp.setMargins(dp(6), 0, dp(4), 0);
        distView.setLayoutParams(distLp);
        headerBar.addView(distView);

        // Quick Header Naver Navi Button (Accessible even when collapsed!)
        TextView headerNaviBtn = new TextView(appContext);
        headerNaviBtn.setText("🟢 내비");
        headerNaviBtn.setTextColor(Color.parseColor("#052E16"));
        headerNaviBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        headerNaviBtn.setTypeface(null, Typeface.BOLD);
        headerNaviBtn.setPadding(dp(7), dp(4), dp(7), dp(4));
        LinearLayout.LayoutParams hNaviLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hNaviLp.setMargins(0, 0, dp(4), 0);
        headerNaviBtn.setLayoutParams(hNaviLp);
        headerNaviBtn.setBackground(makeBg("#03C75A", 8, "#34D399", 1));
        headerNaviBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                triggerStartNaviFromOverlay();
            }
        });
        headerBar.addView(headerNaviBtn);

        collapseBtn = new TextView(appContext);
        collapseBtn.setText("접기 ➖");
        collapseBtn.setTextColor(Color.parseColor("#E2E8F0"));
        collapseBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        collapseBtn.setTypeface(null, Typeface.BOLD);
        collapseBtn.setPadding(dp(7), dp(4), dp(7), dp(4));
        collapseBtn.setBackground(makeBg("#334155", 8, "#475569", 1));
        collapseBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                isCollapsed = !isCollapsed;
                bodyContainer.setVisibility(isCollapsed ? View.GONE : View.VISIBLE);
                collapseBtn.setText(isCollapsed ? "펼치기 ➕" : "접기 ➖");
            }
        });
        headerBar.addView(collapseBtn);

        TextView closeBtn = new TextView(appContext);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#FCA5A5"));
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        closeBtn.setTypeface(null, Typeface.BOLD);
        closeBtn.setPadding(dp(7), dp(4), dp(7), dp(4));
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        closeLp.setMargins(dp(4), 0, 0, 0);
        closeBtn.setLayoutParams(closeLp);
        closeBtn.setBackground(makeBg("#450A0A", 8, "#DC2626", 1));
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hideOverlay();
                evalJs("window.onNativeOverlayClosed && window.onNativeOverlayClosed();");
            }
        });
        headerBar.addView(closeBtn);

        rootContainer.addView(headerBar);

        // Title View (Always visible even when collapsed so user sees school name)
        titleView = new TextView(appContext);
        titleView.setText("목적지 준비중");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setPadding(0, dp(6), 0, dp(2));
        rootContainer.addView(titleView);

        // Body Container (Collapsible)
        bodyContainer = new LinearLayout(appContext);
        bodyContainer.setOrientation(LinearLayout.VERTICAL);

        progressView = new TextView(appContext);
        progressView.setText("품목 터치 시 즉시 체크됩니다");
        progressView.setTextColor(Color.parseColor("#FCD34D"));
        progressView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        progressView.setTypeface(null, Typeface.BOLD);
        progressView.setPadding(0, 0, 0, dp(6));
        bodyContainer.addView(progressView);

        // Scrollable Items Checklist
        ScrollView scrollView = new ScrollView(appContext);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(130)
        );
        scrollView.setLayoutParams(scrollLp);

        itemsContainer = new LinearLayout(appContext);
        itemsContainer.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(itemsContainer);
        bodyContainer.addView(scrollView);

        // Primary Full-Width Naver Navigation Route Guidance Button
        TextView mainNaviBtn = new TextView(appContext);
        mainNaviBtn.setText("🟢 네이버 내비 길안내 출발 (수량표시)");
        mainNaviBtn.setTextColor(Color.parseColor("#052E16"));
        mainNaviBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        mainNaviBtn.setTypeface(null, Typeface.BOLD);
        mainNaviBtn.setGravity(Gravity.CENTER);
        mainNaviBtn.setPadding(dp(10), dp(8), dp(10), dp(8));
        mainNaviBtn.setBackground(makeBg("#03C75A", 10, "#6EE7B7", 1));
        LinearLayout.LayoutParams mainNaviLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        mainNaviLp.setMargins(0, dp(8), 0, 0);
        mainNaviBtn.setLayoutParams(mainNaviLp);
        mainNaviBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                triggerStartNaviFromOverlay();
            }
        });
        bodyContainer.addView(mainNaviBtn);

        // Bottom Action Buttons Row
        LinearLayout actionRow = new LinearLayout(appContext);
        actionRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionRowLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        actionRowLp.setMargins(0, dp(6), 0, 0);
        actionRow.setLayoutParams(actionRowLp);

        TextView completeBtn = new TextView(appContext);
        completeBtn.setText("✓ 완료처리");
        completeBtn.setTextColor(Color.WHITE);
        completeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        completeBtn.setTypeface(null, Typeface.BOLD);
        completeBtn.setGravity(Gravity.CENTER);
        completeBtn.setPadding(dp(8), dp(7), dp(8), dp(7));
        completeBtn.setBackground(makeBg("#059669", 10, "#34D399", 1));
        LinearLayout.LayoutParams btn1Lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        btn1Lp.setMargins(0, 0, dp(4), 0);
        completeBtn.setLayoutParams(btn1Lp);
        completeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                evalJs("window.onNativeOverlayCompleteTarget && window.onNativeOverlayCompleteTarget();");
            }
        });
        actionRow.addView(completeBtn);

        TextView nextBtn = new TextView(appContext);
        nextBtn.setText("다음 원 ▶");
        nextBtn.setTextColor(Color.WHITE);
        nextBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        nextBtn.setTypeface(null, Typeface.BOLD);
        nextBtn.setGravity(Gravity.CENTER);
        nextBtn.setPadding(dp(8), dp(7), dp(8), dp(7));
        nextBtn.setBackground(makeBg("#2563EB", 10, "#60A5FA", 1));
        LinearLayout.LayoutParams btn2Lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        btn2Lp.setMargins(dp(2), 0, dp(2), 0);
        nextBtn.setLayoutParams(btn2Lp);
        nextBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                evalJs("window.onNativeOverlayNextTarget && window.onNativeOverlayNextTarget();");
            }
        });
        actionRow.addView(nextBtn);

        TextView openAppBtn = new TextView(appContext);
        openAppBtn.setText("앱 열기");
        openAppBtn.setTextColor(Color.parseColor("#E2E8F0"));
        openAppBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        openAppBtn.setTypeface(null, Typeface.BOLD);
        openAppBtn.setGravity(Gravity.CENTER);
        openAppBtn.setPadding(dp(8), dp(7), dp(8), dp(7));
        openAppBtn.setBackground(makeBg("#334155", 10, "#64748B", 1));
        LinearLayout.LayoutParams btn3Lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btn3Lp.setMargins(dp(4), 0, 0, 0);
        openAppBtn.setLayoutParams(btn3Lp);
        openAppBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(appContext, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                appContext.startActivity(intent);
            }
        });
        actionRow.addView(openAppBtn);

        bodyContainer.addView(actionRow);
        rootContainer.addView(bodyContainer);

        // Enable dragging by touching headerBar or titleView
        View.OnTouchListener dragListener = new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = layoutParams.x;
                        initialY = layoutParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        layoutParams.x = initialX + (int) (event.getRawX() - initialTouchX);
                        layoutParams.y = initialY + (int) (event.getRawY() - initialTouchY);
                        if (isShowing && windowManager != null) {
                            windowManager.updateViewLayout(rootContainer, layoutParams);
                        }
                        return true;
                }
                return false;
            }
        };
        headerBar.setOnTouchListener(dragListener);
        titleView.setOnTouchListener(dragListener);
    }

    private void renderPayload(String jsonStr) {
        try {
            JSONObject obj = new JSONObject(jsonStr);
            String modeBadge = obj.optString("modeBadge", "🧭 내비고정");
            String modeColor = obj.optString("modeColor", "#059669");
            String name = obj.optString("name", "목적지 없음");
            String distText = obj.optString("distText", "거리 대기");
            String progressText = obj.optString("progressText", "품목 터치 시 즉시 체크");
            currentNaviUrl = obj.optString("naviUrl", "");
            currentWebNaviUrl = obj.optString("webNaviUrl", "");

            badgeView.setText(modeBadge);
            badgeView.setBackground(makeBg(modeColor, 8, null, 0));
            distView.setText(distText);
            titleView.setText(name);
            progressView.setText(progressText);

            itemsContainer.removeAllViews();
            JSONArray items = obj.optJSONArray("items");
            if (items != null && items.length() > 0) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    final int idx = item.optInt("index", i);
                    boolean checked = item.optBoolean("checked", false);
                    String label = item.optString("label", "");

                    TextView row = new TextView(appContext);
                    row.setText((checked ? "☑ " : "☐ ") + label);
                    row.setTextColor(Color.parseColor(checked ? "#6EE7B7" : "#F8FAFC"));
                    row.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                    row.setTypeface(null, Typeface.BOLD);
                    row.setPadding(dp(10), dp(7), dp(10), dp(7));
                    row.setBackground(makeBg(
                        checked ? "#064E3B" : "#1E293B",
                        8,
                        checked ? "#10B981" : "#475569",
                        1
                    ));

                    LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    );
                    rowLp.setMargins(0, 0, 0, dp(5));
                    row.setLayoutParams(rowLp);

                    row.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            evalJs("window.onNativeOverlayToggleItem && window.onNativeOverlayToggleItem(" + idx + ");");
                        }
                    });
                    itemsContainer.addView(row);
                }
            } else {
                TextView empty = new TextView(appContext);
                empty.setText("표시할 품목이 없습니다.");
                empty.setTextColor(Color.parseColor("#94A3B8"));
                empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                itemsContainer.addView(empty);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
`;

  fs.writeFileSync(overlayJavaPath, overlayJavaCode, 'utf8');

  const mainJavaCode = `package ${pkgName};

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private FloatingOverlayManager overlayManager;

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                NetworkInfo info = cm.getActiveNetworkInfo();
                return info != null && info.isConnected();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return true;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            if (isNetworkConnected()) {
                settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            } else {
                settings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            }
            overlayManager = new FloatingOverlayManager(this, webView);
            webView.addJavascriptInterface(overlayManager, "AndroidOverlay");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            if (isNetworkConnected()) {
                webView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
            } else {
                webView.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            }
        }
    }

    @Override
    public void onDestroy() {
        if (overlayManager != null) {
            overlayManager.hideOverlay();
        }
        super.onDestroy();
    }
}
`;

  fs.writeFileSync(mainActivityPath, mainJavaCode, 'utf8');
  console.log('Injected FloatingOverlayManager.java (with Naver Navigation button) and MainActivity.java.');
}
