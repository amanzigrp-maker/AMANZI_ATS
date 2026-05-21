import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

export class SecureUpdateService {
  configure() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.disableWebInstaller = true;
  }

  async enforceMinimumVersion(currentVersion: string, minimumVersion: string) {
    if (this.compareVersions(currentVersion, minimumVersion) < 0) {
      await autoUpdater.checkForUpdatesAndNotify();
      return { allowed: false, reason: "Security update required" };
    }
    return { allowed: true };
  }

  private compareVersions(a: string, b: string) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const delta = (left[index] ?? 0) - (right[index] ?? 0);
      if (delta !== 0) return delta;
    }
    return 0;
  }
}
