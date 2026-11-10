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
    private TextView headerNaviView;
    private ScrollView itemsScroll;
    private String lastName = "";
    private String lastDist = "";
    private boolean lastNearby = false;
    private static final String PREFS = "overlay_prefs";
    private static final int EXPANDED_W_DP = 236;
    private static final int COLLAPSED_W_DP = 188;
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

    private android.content.SharedPreferences prefs() {
        return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private int screenW() { return appContext.getResources().getDisplayMetrics().widthPixels; }
    private int screenH() { return appContext.getResources().getDisplayMetrics().heightPixels; }

    // 내비 화면 위쪽(회전 안내·차로)과 아래쪽(도착 시간·메뉴)을 피해서 오른쪽 가장자리 중간쯤에 둔다
    private void clampPosition() {
        if (layoutParams == null) return;
        int w = layoutParams.width > 0 ? layoutParams.width : dp(EXPANDED_W_DP);
        int h = rootContainer != null && rootContainer.getHeight() > 0 ? rootContainer.getHeight() : dp(48);
        int maxX = Math.max(0, screenW() - w);
        int maxY = Math.max(0, screenH() - h - dp(24));
        layoutParams.x = Math.max(0, Math.min(layoutParams.x, maxX));
        layoutParams.y = Math.max(dp(24), Math.min(layoutParams.y, maxY));
    }

    private void savePosition() {
        if (layoutParams == null) return;
        prefs().edit()
            .putInt("x", layoutParams.x)
            .putInt("y", layoutParams.y)
            .putBoolean("collapsed", isCollapsed)
            .apply();
    }

    private void refreshLayout() {
        if (isShowing && windowManager != null && rootContainer != null) {
            try { windowManager.updateViewLayout(rootContainer, layoutParams); } catch (Exception e) { e.printStackTrace(); }
        }
    }

    private void applyCollapsed(boolean collapsed, boolean remember) {
        isCollapsed = collapsed;
        if (rootContainer == null) return;
        boolean wasRightEdge = layoutParams.x + layoutParams.width >= screenW() - dp(16);
        bodyContainer.setVisibility(collapsed ? View.GONE : View.VISIBLE);
        titleView.setVisibility(collapsed ? View.GONE : View.VISIBLE);
        badgeView.setVisibility(collapsed ? View.GONE : View.VISIBLE);
        if (headerNaviView != null) headerNaviView.setVisibility(collapsed ? View.GONE : View.VISIBLE);
        collapseBtn.setText(collapsed ? "➕" : "➖");
        distView.setText(collapsed ? (lastName.length() > 0 ? lastName + " · " + lastDist : lastDist) : lastDist);
        distView.setTextColor(Color.parseColor(collapsed ? "#F8FAFC" : "#38BDF8"));
        rootContainer.setPadding(collapsed ? dp(8) : dp(9), collapsed ? dp(4) : dp(7), collapsed ? dp(6) : dp(9), collapsed ? dp(4) : dp(8));
        rootContainer.setBackground(collapsed ? makeBg("#B30F172A", 14, "#10B981", 1) : makeBg("#E00F172A", 14, "#10B981", 2));
        int newW = dp(collapsed ? COLLAPSED_W_DP : EXPANDED_W_DP);
        if (wasRightEdge) layoutParams.x = screenW() - newW - dp(4);
        layoutParams.width = newW;
        clampPosition();
        refreshLayout();
        if (remember) savePosition();
    }

    @JavascriptInterface
    public void setCollapsed(final boolean collapsed) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() { applyCollapsed(collapsed, true); }
        });
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
                if (rootContainer != null) applyCollapsed(true, true);
                else prefs().edit().putBoolean("collapsed", true).apply();
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
        applyCollapsed(true, true);
        evalJs("window.onNativeOverlayStartNavi && window.onNativeOverlayStartNavi(false);");
        launchNaviIntent(currentNaviUrl, currentWebNaviUrl);
    }

    private void ensureViewCreated() {
        if (rootContainer != null) return;

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        layoutParams = new WindowManager.LayoutParams(
            dp(EXPANDED_W_DP),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            android.graphics.PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        // 기본 위치: 오른쪽 가장자리, 화면 높이 42% 지점 (네이버 내비 상단 회전안내·하단 도착정보를 피함)
        layoutParams.x = prefs().getInt("x", screenW() - dp(EXPANDED_W_DP) - dp(4));
        layoutParams.y = prefs().getInt("y", (int) (screenH() * 0.42f));

        rootContainer = new LinearLayout(appContext);
        rootContainer.setOrientation(LinearLayout.VERTICAL);
        rootContainer.setPadding(dp(9), dp(7), dp(9), dp(8));
        rootContainer.setBackground(makeBg("#E00F172A", 14, "#10B981", 2));

        // Header Bar (Draggable)
        LinearLayout headerBar = new LinearLayout(appContext);
        headerBar.setOrientation(LinearLayout.HORIZONTAL);
        headerBar.setGravity(Gravity.CENTER_VERTICAL);

        badgeView = new TextView(appContext);
        badgeView.setText("🧭 내비고정");
        badgeView.setTextColor(Color.WHITE);
        badgeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        badgeView.setTypeface(null, Typeface.BOLD);
        badgeView.setSingleLine(true);
        badgeView.setPadding(dp(5), dp(2), dp(5), dp(2));
        badgeView.setBackground(makeBg("#059669", 8, null, 0));
        headerBar.addView(badgeView);

        distView = new TextView(appContext);
        distView.setText("거리 계산중");
        distView.setTextColor(Color.parseColor("#38BDF8"));
        distView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        distView.setTypeface(null, Typeface.BOLD);
        distView.setSingleLine(true);
        distView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams distLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        distLp.setMargins(dp(5), 0, dp(3), 0);
        distView.setLayoutParams(distLp);
        headerBar.addView(distView);

        // Quick Header Naver Navi Button (Accessible even when collapsed!)
        TextView headerNaviBtn = new TextView(appContext);
        headerNaviView = headerNaviBtn;
        headerNaviBtn.setText("내비");
        headerNaviBtn.setTextColor(Color.parseColor("#052E16"));
        headerNaviBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        headerNaviBtn.setTypeface(null, Typeface.BOLD);
        headerNaviBtn.setPadding(dp(6), dp(4), dp(6), dp(4));
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
        collapseBtn.setText("➖");
        collapseBtn.setTextColor(Color.parseColor("#E2E8F0"));
        collapseBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        collapseBtn.setTypeface(null, Typeface.BOLD);
        collapseBtn.setPadding(dp(8), dp(4), dp(8), dp(4));
        collapseBtn.setBackground(makeBg("#334155", 8, "#475569", 1));
        collapseBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                applyCollapsed(!isCollapsed, true);
            }
        });
        headerBar.addView(collapseBtn);

        TextView closeBtn = new TextView(appContext);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#FCA5A5"));
        closeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        closeBtn.setTypeface(null, Typeface.BOLD);
        closeBtn.setPadding(dp(7), dp(3), dp(7), dp(3));
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
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleView.setPadding(0, dp(4), 0, dp(1));
        rootContainer.addView(titleView);

        // Body Container (Collapsible)
        bodyContainer = new LinearLayout(appContext);
        bodyContainer.setOrientation(LinearLayout.VERTICAL);

        progressView = new TextView(appContext);
        progressView.setText("품목 터치 시 즉시 체크됩니다");
        progressView.setTextColor(Color.parseColor("#FCD34D"));
        progressView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        progressView.setTypeface(null, Typeface.BOLD);
        progressView.setPadding(0, 0, 0, dp(4));
        bodyContainer.addView(progressView);

        // Scrollable Items Checklist
        ScrollView scrollView = new ScrollView(appContext);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        scrollView.setLayoutParams(scrollLp);
        itemsScroll = scrollView;

        itemsContainer = new LinearLayout(appContext);
        itemsContainer.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(itemsContainer);
        bodyContainer.addView(scrollView);

        // Primary Full-Width Naver Navigation Route Guidance Button
        TextView mainNaviBtn = new TextView(appContext);
        mainNaviBtn.setText("🟢 네이버 내비 출발");
        mainNaviBtn.setTextColor(Color.parseColor("#052E16"));
        mainNaviBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        mainNaviBtn.setTypeface(null, Typeface.BOLD);
        mainNaviBtn.setGravity(Gravity.CENTER);
        mainNaviBtn.setPadding(dp(8), dp(6), dp(8), dp(6));
        mainNaviBtn.setBackground(makeBg("#03C75A", 10, "#6EE7B7", 1));
        LinearLayout.LayoutParams mainNaviLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        mainNaviLp.setMargins(0, dp(5), 0, 0);
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
        actionRowLp.setMargins(0, dp(4), 0, 0);
        actionRow.setLayoutParams(actionRowLp);

        TextView completeBtn = new TextView(appContext);
        completeBtn.setText("✓ 완료");
        completeBtn.setTextColor(Color.WHITE);
        completeBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        completeBtn.setTypeface(null, Typeface.BOLD);
        completeBtn.setGravity(Gravity.CENTER);
        completeBtn.setPadding(dp(6), dp(5), dp(6), dp(5));
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
        nextBtn.setText("다음 ▶");
        nextBtn.setTextColor(Color.WHITE);
        nextBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        nextBtn.setTypeface(null, Typeface.BOLD);
        nextBtn.setGravity(Gravity.CENTER);
        nextBtn.setPadding(dp(6), dp(5), dp(6), dp(5));
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
        openAppBtn.setText("앱");
        openAppBtn.setTextColor(Color.parseColor("#E2E8F0"));
        openAppBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        openAppBtn.setTypeface(null, Typeface.BOLD);
        openAppBtn.setGravity(Gravity.CENTER);
        openAppBtn.setPadding(dp(6), dp(5), dp(6), dp(5));
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
            private boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = layoutParams.x;
                        initialY = layoutParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - initialTouchX;
                        float dy = event.getRawY() - initialTouchY;
                        if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) moved = true;
                        layoutParams.x = initialX + (int) dx;
                        layoutParams.y = initialY + (int) dy;
                        clampPosition();
                        refreshLayout();
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            if (isCollapsed) applyCollapsed(false, true);   // 접힌 막대를 톡 누르면 펼침
                        } else {
                            // 가장자리 가까이 놓으면 붙여서 지도를 덜 가리게
                            int w = layoutParams.width;
                            if (layoutParams.x + w / 2 > screenW() / 2) layoutParams.x = screenW() - w - dp(4);
                            else layoutParams.x = dp(4);
                            clampPosition();
                            refreshLayout();
                            savePosition();
                        }
                        return true;
                }
                return false;
            }
        };
        headerBar.setOnTouchListener(dragListener);
        titleView.setOnTouchListener(dragListener);
        distView.setOnTouchListener(dragListener);

        applyCollapsed(prefs().getBoolean("collapsed", false), false);
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

            boolean nearby = obj.optBoolean("nearby", false);
            lastName = name;
            lastDist = distText;
            badgeView.setText(modeBadge);
            badgeView.setBackground(makeBg(modeColor, 8, null, 0));
            titleView.setText(name);
            progressView.setText(progressText);
            if (nearby && !lastNearby && isCollapsed) {
                applyCollapsed(false, false);   // 도착 근처면 품목 체크를 위해 자동으로 펼침
            } else {
                distView.setText(isCollapsed ? (name.length() > 0 ? name + " · " + distText : distText) : distText);
            }
            lastNearby = nearby;

            itemsContainer.removeAllViews();
            JSONArray items = obj.optJSONArray("items");
            if (itemsScroll != null) {
                // 품목이 많아도 4줄 높이까지만 차지하고 나머지는 스크롤
                int n = items != null ? items.length() : 1;
                ViewGroup.LayoutParams lp = itemsScroll.getLayoutParams();
                lp.height = n > 4 ? dp(124) : ViewGroup.LayoutParams.WRAP_CONTENT;
                itemsScroll.setLayoutParams(lp);
            }
            if (items != null && items.length() > 0) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    final int idx = item.optInt("index", i);
                    boolean checked = item.optBoolean("checked", false);
                    String label = item.optString("label", "");

                    TextView row = new TextView(appContext);
                    row.setText((checked ? "☑ " : "☐ ") + label);
                    row.setTextColor(Color.parseColor(checked ? "#6EE7B7" : "#F8FAFC"));
                    row.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                    row.setTypeface(null, Typeface.BOLD);
                    row.setPadding(dp(8), dp(5), dp(8), dp(5));
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
                    rowLp.setMargins(0, 0, 0, dp(3));
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
// === APK 지도 열기 + 한국어 음성 브리지 패치 ===
{
  const patchMainPath = findMainActivity(javaRoot);

  if (!patchMainPath || !fs.existsSync(patchMainPath)) {
    throw new Error(
      '[DeliveryAppBridge] MainActivity.java를 찾지 못했습니다.'
    );
  }

  let mainSource = fs.readFileSync(patchMainPath, 'utf8');
  const packageMatch = mainSource.match(
    /package\s+([a-zA-Z0-9_.]+)\s*;/
  );

  if (!packageMatch) {
    throw new Error(
      '[DeliveryAppBridge] MainActivity의 package를 찾지 못했습니다.'
    );
  }

  const bridgePackage = packageMatch[1];
  const bridgeFile = path.join(
    path.dirname(patchMainPath),
    'DeliveryAppBridge.java'
  );

  const bridgeSource = `package ${bridgePackage};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.util.Locale;

public class DeliveryAppBridge {
    private final Activity activity;
    private final Handler handler =
        new Handler(Looper.getMainLooper());

    private TextToSpeech tts;
    private boolean ready = false;
    private String pendingText = null;

    public DeliveryAppBridge(Activity activity) {
        this.activity = activity;

        handler.post(() -> {
            tts = new TextToSpeech(
                activity.getApplicationContext(),
                status -> handler.post(() -> {
                    if (status != TextToSpeech.SUCCESS) {
                        notifyUser("음성 엔진을 초기화하지 못했습니다.");
                        return;
                    }

                    int result = tts.setLanguage(Locale.KOREAN);

                    if (result == TextToSpeech.LANG_MISSING_DATA
                        || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        notifyUser(
                            "한국어 음성 데이터가 없거나 지원되지 않습니다."
                        );
                        return;
                    }

                    ready = true;

                    if (pendingText != null) {
                        String text = pendingText;
                        pendingText = null;
                        speakInternal(text);
                    }
                })
            );
        });
    }

    private void notifyUser(String message) {
        Toast.makeText(
            activity,
            message,
            Toast.LENGTH_LONG
        ).show();
    }

    @JavascriptInterface
    public void speak(String text) {
        if (text == null || text.trim().isEmpty()) return;

        handler.post(() -> {
            if (!ready) {
                pendingText = text;
                return;
            }
            speakInternal(text);
        });
    }

    private void speakInternal(String text) {
        if (tts == null || !ready) return;

        int result = tts.speak(
            text,
            TextToSpeech.QUEUE_ADD,
            null,
            "delivery-" + System.nanoTime()
        );

        if (result == TextToSpeech.ERROR) {
            notifyUser("음성 안내를 재생하지 못했습니다.");
        }
    }

    @JavascriptInterface
    public void stopSpeaking() {
        handler.post(() -> {
            pendingText = null;
            if (tts != null) tts.stop();
        });
    }

    @JavascriptInterface
    public void openNaverMap(String url) {
        handler.post(() -> {
            try {
                Uri uri = Uri.parse(url);
                String scheme = uri.getScheme();
                String host = uri.getHost();

                boolean naverWeb =
                    ("https".equalsIgnoreCase(scheme)
                        || "http".equalsIgnoreCase(scheme))
                    && host != null
                    && (
                        host.equalsIgnoreCase("map.naver.com")
                        || host.equalsIgnoreCase("m.map.naver.com")
                        || host.equalsIgnoreCase("naver.me")
                    );

                if (!naverWeb) {
                    notifyUser("허용되지 않은 지도 주소입니다.");
                    return;
                }

                Intent naverIntent =
                    new Intent(Intent.ACTION_VIEW, uri);
                naverIntent.setPackage("com.nhn.android.nmap");

                try {
                    activity.startActivity(naverIntent);
                    return;
                } catch (
                    android.content.ActivityNotFoundException ignored
                ) {
                    // 네이버 지도에서 처리하지 못하면 기본 앱으로 열기
                }

                Intent fallback =
                    new Intent(Intent.ACTION_VIEW, uri);
                activity.startActivity(fallback);

            } catch (Exception e) {
                notifyUser("네이버 지도를 열지 못했습니다.");
            }
        });
    }

    public void shutdown() {
        handler.post(() -> {
            ready = false;
            pendingText = null;
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
            }
        });
    }
}
`;

  fs.writeFileSync(bridgeFile, bridgeSource, 'utf8');

  if (!mainSource.includes(
    'private DeliveryAppBridge deliveryAppBridge;'
  )) {
    const activityPattern =
      /public\s+class\s+MainActivity\s+extends\s+BridgeActivity\s*\{/;

    if (!activityPattern.test(mainSource)) {
      throw new Error(
        '[DeliveryAppBridge] MainActivity 선언 형태가 예상과 다릅니다.'
      );
    }

    mainSource = mainSource.replace(
      activityPattern,
      `$&
    private DeliveryAppBridge deliveryAppBridge;
`
    );
  }

  if (!mainSource.includes(
    'webView.addJavascriptInterface(deliveryAppBridge, "DeliveryNative")'
  )) {
    const registrationAnchor =
      'webView.addJavascriptInterface(overlayManager, "AndroidOverlay");';

    if (!mainSource.includes(registrationAnchor)) {
      throw new Error(
        '[DeliveryAppBridge] AndroidOverlay 등록 위치를 찾지 못했습니다.'
      );
    }

    mainSource = mainSource.replace(
      registrationAnchor,
      `${registrationAnchor}
            deliveryAppBridge = new DeliveryAppBridge(this);
            webView.addJavascriptInterface(
                deliveryAppBridge, "DeliveryNative"
            );
`
    );
  }

  if (!mainSource.includes(
    'deliveryAppBridge.shutdown();'
  )) {
    const destroyPattern =
      /(?:public|protected)\s+void\s+onDestroy\s*\(\s*\)\s*\{/;

    if (destroyPattern.test(mainSource)) {
      mainSource = mainSource.replace(
        destroyPattern,
        `$&
        if (deliveryAppBridge != null) {
            deliveryAppBridge.shutdown();
        }
`
      );
    } else {
      const lastBrace = mainSource.lastIndexOf('}');

      mainSource =
        mainSource.slice(0, lastBrace)
        + `
    @Override
    public void onDestroy() {
        if (deliveryAppBridge != null) {
            deliveryAppBridge.shutdown();
        }
        super.onDestroy();
    }
`
        + mainSource.slice(lastBrace);
    }
  }

  fs.writeFileSync(patchMainPath, mainSource, 'utf8');

  const patchManifestPath =
    'android/app/src/main/AndroidManifest.xml';

  let patchedManifest = fs.readFileSync(
    patchManifestPath, 'utf8'
  );

  if (!patchedManifest.includes(
    'android.intent.action.TTS_SERVICE'
  )) {
    const ttsQuery = `
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
`;

    if (patchedManifest.includes('</queries>')) {
      patchedManifest = patchedManifest.replace(
        '</queries>',
        `${ttsQuery}    </queries>`
      );
    } else {
      patchedManifest = patchedManifest.replace(
        '</manifest>',
        `    <queries>${ttsQuery}    </queries>
</manifest>`
      );
    }

    fs.writeFileSync(
      patchManifestPath, patchedManifest, 'utf8'
    );
  }

  console.log(
    'DeliveryAppBridge: 외부 지도 열기 및 한국어 TTS 연결 완료'
  );
}
