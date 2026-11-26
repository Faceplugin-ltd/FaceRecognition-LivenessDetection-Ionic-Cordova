#!/usr/bin/env python3
# Windows:  python run_ios.py          (prints that iOS needs a Mac)
# macOS:    python3 run_ios.py   or  ./run_ios.py
"""Deploy the iOS demo to a plugged-in iPhone. macOS + Xcode; the same file runs on Windows and explains that."""
from __future__ import annotations

import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def which(name: str) -> str | None:
    hits = [shutil.which(name)]
    if IS_WIN:
        hits.extend([shutil.which(name + ".cmd"), shutil.which(name + ".exe")])
    return next((h for h in hits if h), None)


def need(name: str, hint: str) -> str:
    path = which(name)
    if not path:
        die(f"{name} is not on PATH. {hint}")
    return path


def run(args: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(str(a) for a in args))
    r = subprocess.run(args, cwd=str(cwd or ROOT))
    if r.returncode:
        raise SystemExit(r.returncode)


def npm() -> str:
    return need("npm", "Install Node.js from https://nodejs.org/")


def npx() -> str:
    return need("npx", "Install Node.js from https://nodejs.org/")


def stack() -> str:
    if (ROOT / "pubspec.yaml").is_file() and (ROOT / "example" / "pubspec.yaml").is_file():
        return "flutter"
    if (ROOT / "FaceRecognitionCapacitor.podspec").is_file():
        return "ionic"
    if (ROOT / "config.xml").is_file() and (ROOT / "FacePlugin").is_dir():
        return "cordova"
    if (ROOT / "face-recognition-sdk.podspec").is_file():
        return "rn"
    if (ROOT / "src" / "FaceRecognition.Net.Maui").is_dir():
        return "maui"
    die(f"unrecognized Face Recognition repo: {ROOT}")
    raise SystemExit(1)


def copy_if_missing(src: Path, dest: Path) -> bool:
    if dest.exists() or not src.exists():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, dest, symlinks=True)
    else:
        shutil.copy2(src, dest)
    print(f"copied {src} -> {dest}")
    return True


def ensure_ios_runtimes(dest: Path) -> None:
    if (dest / "facerecognitionsdk.framework").is_dir():
        return
    src = ROOT.parent / "Face-Recognition-LivenessDetection-iOS"
    names = [
        "facerecognitionsdk.framework",
        "FacePluginSDK.xcframework",
        "FacePlugin.xcframework",
        "FaceDetect.xcframework",
    ]
    if not all((src / n).exists() for n in names):
        die(f"missing iOS runtimes in {dest}\nCopy them from Face-Recognition-LivenessDetection-iOS.")
    dest.mkdir(parents=True, exist_ok=True)
    for n in names:
        copy_if_missing(src / n, dest / n)
    for xc in ("FacePluginSDK.xcframework", "FacePlugin.xcframework", "FaceDetect.xcframework"):
        slice_dir = dest / xc / "ios-arm64"
        if not slice_dir.is_dir():
            continue
        fws = list(slice_dir.glob("*.framework"))
        if fws:
            copy_if_missing(fws[0], dest / fws[0].name)


def ios_udid() -> str:
    need("xcrun", "Install Xcode and its command-line tools.")
    raw = subprocess.check_output(
        ["xcrun", "xctrace", "list", "devices"],
        text=True,
        stderr=subprocess.STDOUT,
        errors="replace",
    )
    in_sims = False
    for line in raw.splitlines():
        lower = line.lower()
        if "simulator" in lower:
            in_sims = True
            continue
        if in_sims or "(" not in line or ")" not in line:
            continue
        if "mac" in lower or "watch" in lower or "apple tv" in lower:
            continue
        udid = line.rsplit("(", 1)[-1].strip().rstrip(")")
        token = udid.replace("-", "")
        if len(token) >= 16 and token.isalnum():
            print(f"iOS device: {line.strip()}")
            return udid
    die("no physical iPhone. Plug one in and trust this computer.")
    raise SystemExit(1)


def npm_install(cwd: Path) -> None:
    if not (cwd / "node_modules").is_dir():
        run([npm(), "install"], cwd=cwd)


def flutter_ios() -> None:
    flutter = need("flutter", "Install Flutter and add it to PATH.")
    run([flutter, "pub", "get"], cwd=ROOT)
    run([flutter, "pub", "get"], cwd=ROOT / "example")
    ensure_ios_runtimes(ROOT / "ios" / "Frameworks")
    device = ios_udid()
    raw = subprocess.check_output([flutter, "devices", "--machine"], text=True, errors="replace")
    try:
        for d in json.loads(raw):
            if str(d.get("targetPlatform") or "").startswith("ios") and not d.get("emulator"):
                device = str(d.get("id") or device)
                break
    except json.JSONDecodeError:
        pass
    pod = ROOT / "example" / "ios" / "Podfile"
    if pod.is_file() and which("pod"):
        run(["pod", "install"], cwd=pod.parent)
    run([flutter, "run", "-d", device], cwd=ROOT / "example")


def ionic_ios() -> None:
    npm_install(ROOT)
    run([npm(), "run", "build"], cwd=ROOT)
    example = ROOT / "example"
    npm_install(example)
    run([npm(), "run", "build"], cwd=example)
    ensure_ios_runtimes(ROOT / "ios" / "Frameworks")
    target = ios_udid()
    run([npx(), "cap", "sync", "ios"], cwd=example)
    run([npx(), "cap", "run", "ios", "--no-sync", "--target", target], cwd=example)


def cordova_device_app() -> tuple[Path, str]:
    """The signed device bundle Cordova exported, and its bundle id.

    `ios-deploy` often misses a phone on current iOS, so Cordova never unpacks the
    IPA and the `.app` the simulator step looks for is not there. Unpack it here.
    """
    build_dir = ROOT / "platforms" / "ios" / "build" / "Debug-iphoneos"
    apps = [p for p in build_dir.glob("*.app") if (p / "Info.plist").is_file()]
    if not apps:
        ipas = sorted(build_dir.glob("*.ipa"))
        if not ipas:
            die(f"no device app in {build_dir}")
        run(["unzip", "-o", "-qq", ipas[-1].name], cwd=build_dir)
        payload = build_dir / "Payload"
        unpacked = [p for p in payload.glob("*.app") if (p / "Info.plist").is_file()]
        if not unpacked:
            die(f"{ipas[-1].name} has no Payload app")
        dest = build_dir / unpacked[0].name
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(unpacked[0]), str(dest))
        shutil.rmtree(payload, ignore_errors=True)
        apps = [dest]
    app = apps[0]
    with app.joinpath("Info.plist").open("rb") as fh:
        bundle = str(plistlib.load(fh).get("CFBundleIdentifier") or "")
    if not bundle:
        die(f"{app} has no CFBundleIdentifier")
    return app, bundle


def cordova_install_and_launch(device: str) -> None:
    app, bundle = cordova_device_app()
    run(["xcrun", "devicectl", "device", "install", "app", "--device", device, str(app)])
    run(
        [
            "xcrun",
            "devicectl",
            "device",
            "process",
            "launch",
            "--device",
            device,
            bundle,
        ]
    )


def cordova_ios() -> None:
    npm_install(ROOT)
    ensure_ios_runtimes(ROOT / "FacePlugin" / "src" / "ios" / "Frameworks")
    device = ios_udid()
    # The demo typechecks against FacePlugin/dist. Rebuild that before the app.
    run([npm(), "run", "plugin:build"], cwd=ROOT)
    run([npm(), "run", "build"], cwd=ROOT)
    # Cordova freezes FacePlugin into plugins/ + platforms/ at add time. Always
    # reinstall so detect-time templates (and the rest of FaceSdkCompat) match source.
    setup = ROOT / "scripts" / "setup-ios.js"
    if setup.is_file():
        run([need("node", "Install Node.js."), str(setup)], cwd=ROOT)
    else:
        plugin_dir = ROOT / "plugins" / "face-recognition-cordova"
        if plugin_dir.is_dir():
            run([npx(), "cordova", "plugin", "remove", "face-recognition-cordova", "--nosave"], cwd=ROOT)
        run([npx(), "cordova", "plugin", "add", "./FacePlugin", "--nofetch", "--nosave"], cwd=ROOT)
        run([npx(), "cordova", "prepare", "ios"], cwd=ROOT)
    print("+", npx(), "cordova run ios --device --target", device)
    launched = subprocess.run(
        [npx(), "cordova", "run", "ios", "--device", "--target", device],
        cwd=str(ROOT),
    )
    if launched.returncode == 0:
        return
    # ios-deploy on newer iOS often cannot see the phone, so the archive is
    # exported and then nothing is installed. Install that bundle and launch it.
    print("cordova run exited", launched.returncode, "; installing with devicectl")
    cordova_install_and_launch(device)


def rn_ios() -> None:
    example = ROOT / "example"
    npm_install(ROOT)
    npm_install(example)
    ensure_ios_runtimes(ROOT / "ios" / "Frameworks")
    udid = ios_udid()
    if which("pod"):
        run(["pod", "install"], cwd=example / "ios")
    run([npx(), "react-native", "run-ios", "--udid", udid], cwd=example)


def maui_ios() -> None:
    dotnet = need("dotnet", "Install the .NET 8 SDK.")
    proj = ROOT / "src" / "FaceRecognition.Net.Maui" / "FaceRecognition.Net.Maui.csproj"
    ensure_ios_runtimes(proj.parent / "Platforms" / "iOS" / "Frameworks")
    device = ios_udid()
    run([dotnet, "build", str(proj), "-f", "net8.0-ios", "-r", "ios-arm64"], cwd=ROOT)
    app = proj.parent / "bin" / "Debug" / "net8.0-ios" / "ios-arm64" / "FaceRecognition.Net.Maui.app"
    if not app.is_dir():
        die(f"MAUI app bundle missing: {app}")
    run(["xcrun", "devicectl", "device", "install", "app", "--device", device, str(app)])
    run(
        [
            "xcrun",
            "devicectl",
            "device",
            "process",
            "launch",
            "--device",
            device,
            "com.faceplugin.facerecognition.app",
        ]
    )


def main() -> None:
    if not IS_MAC:
        die("iOS builds need macOS and Xcode. Use python run_android.py on this machine.")
    kind = stack()
    print(f"{ROOT.name}: ios ({kind})")
    {
        "flutter": flutter_ios,
        "ionic": ionic_ios,
        "cordova": cordova_ios,
        "rn": rn_ios,
        "maui": maui_ios,
    }[kind]()


if __name__ == "__main__":
    main()
