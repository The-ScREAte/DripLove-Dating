# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Capacitor WebView optimization
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor plugins
-keep class com.getcapacitor.** { *; }
-keepnames class com.getcapacitor.** { *; }

# Keep Google Play Services
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# WebView optimization
-keepclassmembers class fqcn.of.javascript.interface.for.webview {
   public *;
}

# Optimization flags
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

# Keep line numbers for debugging crashes
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Fix for R8 missing classes (Conscrypt - security provider)
-dontwarn org.conscrypt.Conscrypt
-dontwarn org.conscrypt.OpenSSLProvider

# Keep OkHttp and related networking classes
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# Keep Retrofit and networking
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**

# Keep Gson for JSON parsing
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# Keep annotation classes
-keep class * extends java.lang.annotation.Annotation { *; }
