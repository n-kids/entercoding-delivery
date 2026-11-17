package __PACKAGE__;

// WEB_OVERLAY_SHELL_V1
// 미니창 "창틀"만 담당하는 네이티브 코드입니다.
// 창 안의 화면(배지, 품목, 버튼)은 GitHub Pages 의 overlay.html 이 그리므로
// 미니창 디자인·기능 수정은 APK 재설치 없이 웹 업로드만으로 반영됩니다.
// overlay.html 을 불러오지 못하면 기존 네이티브 미니창(fallback)으로 자동 전환합니다.

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;

public class WebOverlayController {
    public static final int SHELL_VERSION = 1;
    private static final String TAG = "NkWebOverlay";
    private static final String OVERLAY_URL = "https://n-kids.github.io/entercoding-delivery/overlay.html";
    private static final String PREFS = "web_overlay_prefs";
    private static final long READY_TIMEOUT_MS = 8000L;

    private final Activity activity;
    private final Context appContext;
    private final WebView mainWebView;
    private final Runnable fallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final WindowManager windowManager;

    private WebView view;
    private WindowManager.LayoutParams lp;
    private boolean showing = false;
    private boolean ready = false;
    private boolean failed = false;
    private String pendingPayload = "{}";
    private String naviUrl = "";
    private String webNaviUrl = "";
    private String pageVersion = "";

    // drag
    private volatile boolean dragArmed = false;
    private boolean dragMoved = false;
    private float downRawX, downRawY;
    private int downX, downY;

    private final Runnable readyTimeout = new Runnable() {
        @Override
        public void run() {
            if (!ready) fail("overlay.html 응답 없음 (" + READY_TIMEOUT_MS + "ms)");
        }
    };

    public WebOverlayController(Activity activity, WebView mainWebView, Runnable fallback) {
        this.activity = activity;
        this.appContext = activity.getApplicationContext();
        this.mainWebView = mainWebView;
        this.fallback = fallback;
        this.windowManager = (WindowManager) appContext.getSystemService(Context.WINDOW_SERVICE);
    }

    // ------------------------------------------------------------ public API
    public boolean isUsable() { return !failed; }
    public boolean isShowing() { return showing; }
    public String getPageVersion() { return pageVersion; }

    /** 메인 스레드에서 호출 */
    public void show(String payload) {
        if (failed) return;
        setPayload(payload);
        if (!showing) {
            ensureView();
            try {
                windowManager.addView(view, lp);
                showing = true;
                Log.d(TAG, "show (ready=" + ready + ")");
            } catch (Exception e) {
                fail("addView 실패: " + e);
                return;
            }
        }
        if (ready) render();
    }

    public void update(String payload) {
        setPayload(payload);
        if (showing && ready) render();
    }

    public void hide() {
        handler.removeCallbacks(readyTimeout);
        if (showing && view != null) {
            try { windowManager.removeView(view); } catch (Exception e) { Log.w(TAG, "removeView", e); }
        }
        showing = false;
    }

    public void setCollapsed(boolean collapsed) {
        if (showing && ready) eval("window.nkSetCollapsed && window.nkSetCollapsed(" + collapsed + ");");
    }

    public void destroy() {
        hide();
        if (view != null) {
            try { view.destroy(); } catch (Exception ignored) {}
            view = null;
        }
        ready = false;
    }

    // ------------------------------------------------------------ internals
    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, appContext.getResources().getDisplayMetrics());
    }
    private int screenW() { return appContext.getResources().getDisplayMetrics().widthPixels; }
    private int screenH() { return appContext.getResources().getDisplayMetrics().heightPixels; }
    private SharedPreferences prefs() { return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private void setPayload(String payload) {
        pendingPayload = payload != null && payload.length() > 0 ? payload : "{}";
        try {
            JSONObject o = new JSONObject(pendingPayload);
            naviUrl = o.optString("naviUrl", "");
            webNaviUrl = o.optString("webNaviUrl", "");
        } catch (Exception e) {
            Log.w(TAG, "payload JSON 오류", e);
            pendingPayload = "{}";
        }
    }

    private void render() {
        eval("window.nkRender && window.nkRender(" + pendingPayload + ");");
    }

    private void eval(final String js) {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (view != null) view.evaluateJavascript(js, null);
            }
        });
    }

    private void evalMain(final String js) {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (mainWebView != null) mainWebView.evaluateJavascript(js, null);
            }
        });
    }

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) appContext.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                NetworkInfo info = cm.getActiveNetworkInfo();
                return info != null && info.isConnected();
            }
        } catch (Exception ignored) {}
        return true;
    }

    private void fail(String reason) {
        if (failed) return;
        failed = true;
        Log.w(TAG, "웹 미니창 사용 불가 → 기존 네이티브 미니창으로 전환: " + reason);
        handler.post(new Runnable() {
            @Override
            public void run() {
                boolean wasShowing = showing;
                destroy();
                if (wasShowing && fallback != null) fallback.run();
            }
        });
    }

    private void ensureView() {
        if (view != null) return;
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(
            dp(208), dp(120), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = prefs().getInt("x", screenW() - dp(208) - dp(4));
        lp.y = prefs().getInt("y", (int) (screenH() * 0.42f));
        clamp();

        view = new WebView(appContext);
        view.setBackgroundColor(Color.TRANSPARENT);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        s.setCacheMode(isNetworkConnected() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK);
        view.addJavascriptInterface(new Bridge(), "OverlayHost");
        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame() && !ready) {
                    fail("로드 오류 " + (err != null ? err.getErrorCode() + " " + err.getDescription() : ""));
                }
            }
        });
        view.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                return handleTouch(v, e);
            }
        });
        ready = false;
        handler.removeCallbacks(readyTimeout);
        handler.postDelayed(readyTimeout, READY_TIMEOUT_MS);
        view.loadUrl(OVERLAY_URL + "?shell=" + SHELL_VERSION);
    }

    private void clamp() {
        if (lp == null) return;
        int maxX = Math.max(0, screenW() - lp.width);
        int maxY = Math.max(dp(24), screenH() - lp.height - dp(24));
        lp.x = Math.max(0, Math.min(lp.x, maxX));
        lp.y = Math.max(dp(24), Math.min(lp.y, maxY));
    }

    private void relayout() {
        if (showing && view != null) {
            try { windowManager.updateViewLayout(view, lp); } catch (Exception e) { Log.w(TAG, "updateViewLayout", e); }
        }
    }

    private boolean handleTouch(View v, MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                dragArmed = false;
                dragMoved = false;
                downRawX = e.getRawX();
                downRawY = e.getRawY();
                downX = lp.x;
                downY = lp.y;
                return false;
            case MotionEvent.ACTION_MOVE:
                if (!dragArmed) return false;
                float dx = e.getRawX() - downRawX;
                float dy = e.getRawY() - downRawY;
                if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) dragMoved = true;
                if (dragMoved) {
                    lp.x = downX + (int) dx;
                    lp.y = downY + (int) dy;
                    clamp();
                    relayout();
                }
                return false;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                boolean moved = dragArmed && dragMoved;
                dragArmed = false;
                if (moved) {
                    // 가장자리에 붙여서 지도를 덜 가리게
                    if (lp.x + lp.width / 2 > screenW() / 2) lp.x = screenW() - lp.width - dp(4);
                    else lp.x = dp(4);
                    clamp();
                    relayout();
                    prefs().edit().putInt("x", lp.x).putInt("y", lp.y).apply();
                    // 드래그 후 손을 뗄 때 버튼이 눌리지 않도록 WebView 에는 취소로 전달
                    MotionEvent cancel = MotionEvent.obtain(e);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    v.onTouchEvent(cancel);
                    cancel.recycle();
                    return true;
                }
                return false;
        }
        return false;
    }

    private void launchNavi() {
        try {
            if (naviUrl.length() > 0) {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(naviUrl));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                appContext.startActivity(i);
                return;
            }
        } catch (Exception e) {
            Log.w(TAG, "내비 앱 실행 실패, 웹 지도로 전환", e);
        }
        try {
            if (webNaviUrl.length() > 0) {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(webNaviUrl));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                appContext.startActivity(i);
            }
        } catch (Exception e) {
            Log.w(TAG, "웹 지도 실행 실패", e);
        }
    }

    private static boolean isAllowedMainFn(String fn) {
        return fn != null && fn.matches("onNativeOverlay[A-Za-z]{1,40}");
    }

    // overlay.html 에서 window.OverlayHost.* 로 호출
    private class Bridge {
        @JavascriptInterface
        public int getShellVersion() { return SHELL_VERSION; }

        @JavascriptInterface
        public void ready(final String version) {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    ready = true;
                    pageVersion = version != null ? version : "";
                    handler.removeCallbacks(readyTimeout);
                    Log.d(TAG, "overlay.html ready v=" + pageVersion);
                    if (showing) render();
                }
            });
        }

        /** 창 크기를 웹 화면이 정함 → 크기·배치 변경도 웹 수정만으로 가능 */
        @JavascriptInterface
        public void setSize(final int wDp, final int hDp) {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    if (lp == null) return;
                    int w = dp(Math.max(80, Math.min(wDp, 360)));
                    int h = dp(Math.max(24, Math.min(hDp, 640)));
                    if (w == lp.width && h == lp.height) return;
                    boolean rightEdge = lp.x + lp.width >= screenW() - dp(16);
                    if (rightEdge) lp.x = screenW() - w - dp(4);
                    lp.width = w;
                    lp.height = h;
                    clamp();
                    relayout();
                }
            });
        }

        /** 드래그 손잡이(pointerdown)에서 호출 */
        @JavascriptInterface
        public void beginDrag() { dragArmed = true; }

        /** 메인 앱 화면의 window.onNativeOverlay* 함수 호출 (허용된 이름만) */
        @JavascriptInterface
        public void callMain(String fn, String jsonArg) {
            if (!isAllowedMainFn(fn)) { Log.w(TAG, "허용되지 않은 호출: " + fn); return; }
            String arg = "";
            if (jsonArg != null && jsonArg.length() > 0) {
                try {
                    Object v = new JSONArray("[" + jsonArg + "]").get(0);
                    arg = v instanceof String ? JSONObject.quote((String) v) : String.valueOf(v);
                } catch (Exception e) {
                    Log.w(TAG, "callMain 인자 오류: " + jsonArg);
                    return;
                }
            }
            evalMain("window." + fn + " && window." + fn + "(" + arg + ");");
        }

        @JavascriptInterface
        public void startNavi() {
            evalMain("window.onNativeOverlayStartNavi && window.onNativeOverlayStartNavi(false);");
            handler.post(new Runnable() {
                @Override
                public void run() { launchNavi(); }
            });
        }

        @JavascriptInterface
        public void callPhone(final String rawPhone) {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    String cleaned = rawPhone != null ? rawPhone.replaceAll("[^0-9+*#,]", "") : "";
                    if (cleaned.isEmpty()) return;
                    try {
                        Intent i = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + cleaned));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        appContext.startActivity(i);
                    } catch (Exception e) {
                        Log.w(TAG, "전화 걸기 실패", e);
                    }
                }
            });
        }

        @JavascriptInterface
        public void openApp() {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(appContext, activity.getClass());
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    appContext.startActivity(i);
                }
            });
        }

        @JavascriptInterface
        public void close() {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    hide();
                    evalMain("window.onNativeOverlayClosed && window.onNativeOverlayClosed();");
                }
            });
        }

        @JavascriptInterface
        public void log(String msg) { Log.d(TAG, "page: " + msg); }
    }
}
