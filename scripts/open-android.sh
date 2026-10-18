#!/bin/sh
# Capacitor looks for a tarball install at /usr/local/android-studio.
# Prefer that when present, otherwise the Flathub Android Studio launcher.
if [ -z "$CAPACITOR_ANDROID_STUDIO_PATH" ]; then
  if [ -x /usr/local/android-studio/bin/studio ]; then
    CAPACITOR_ANDROID_STUDIO_PATH=/usr/local/android-studio/bin/studio
  elif [ -x /usr/local/android-studio/bin/studio.sh ]; then
    CAPACITOR_ANDROID_STUDIO_PATH=/usr/local/android-studio/bin/studio.sh
  elif [ -x /var/lib/flatpak/exports/bin/com.google.AndroidStudio ]; then
    CAPACITOR_ANDROID_STUDIO_PATH=/var/lib/flatpak/exports/bin/com.google.AndroidStudio
  elif [ -x "$HOME/.local/share/flatpak/exports/bin/com.google.AndroidStudio" ]; then
    CAPACITOR_ANDROID_STUDIO_PATH="$HOME/.local/share/flatpak/exports/bin/com.google.AndroidStudio"
  fi
  export CAPACITOR_ANDROID_STUDIO_PATH
fi

exec cap open android
