import { IonButton, IonContent, IonPage, IonRange, IonToggle } from '@ionic/react';
import { score } from '../format';
import {
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  resetSettings,
  updateSettings,
  useSettings,
} from '../data/settings';
import { licenseTier, machineCode, stateMessage, useEngineState } from '../engine';
import { Card, Pill, Row } from '../ui/components';
import { S } from '../strings';
import logo from '../assets/fp_logo.png';
import pkg from '../../package.json';

// Android reports this as a constant, not a value read from the engine.
const SDK_VERSION = 'Face Recognition SDK';
const APP_VERSION: string = pkg.version;

/**
 * One Matching card in the order `fragment_settings.xml` lays it out, then About. Reset is on
 * the header, as on Android. Android `shell/SettingsFragment.kt`.
 */
export default function SettingsPage() {
  const s = useSettings();
  const engine = useEngineState();
  const license = licenseTier();

  const licenseText = [
    license.label || (license.licensed ? 'Licensed' : 'Not licensed'),
    license.licensed &&
    license.levelName &&
    license.levelName.toLowerCase() !== 'none'
      ? license.levelName
      : '',
    license.recognition ? 'Recognition' : '',
    license.liveness ? 'Liveness' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <IonPage>
    <IonContent className="ion-padding">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>{S.settings}</div>
        <IonButton size="small" fill="clear" onClick={() => resetSettings()}>
          {S.reset}
        </IonButton>
      </div>

      <Card style={{ marginTop: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{S.matching}</div>
        <UnitSlider
          label={S.match_threshold}
          value={s.threshold}
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          onChange={(threshold) => updateSettings({ threshold })}
        />
        <div style={{ fontSize: 12, opacity: 0.7 }}>{S.threshold_help}</div>

        <SwitchRow
          label={S.liveness_check}
          help={S.liveness_help}
          checked={s.liveness}
          onChange={(liveness) => updateSettings({ liveness })}
        />
        <SwitchRow
          label={S.skip_review}
          help={S.skip_review_help}
          checked={s.skipReview}
          onChange={(skipReview) => updateSettings({ skipReview })}
        />

        <UnitSlider
          label={S.liveness_threshold}
          value={s.livenessThreshold}
          min={0}
          max={1}
          onChange={(livenessThreshold) => updateSettings({ livenessThreshold })}
        />
        <AngleSlider
          label={S.yaw_threshold}
          value={s.yaw}
          onChange={(yaw) => updateSettings({ yaw })}
        />
        <AngleSlider
          label={S.roll_threshold}
          value={s.roll}
          onChange={(roll) => updateSettings({ roll })}
        />
        <AngleSlider
          label={S.pitch_threshold}
          value={s.pitch}
          onChange={(pitch) => updateSettings({ pitch })}
        />
      </Card>

      <Card style={{ marginTop: 12, marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          {S.about}
        </div>
        <Row label="License" value={licenseText} />
        <Row label={S.txt_sdk_version} value={SDK_VERSION} />
        <Row label={S.txt_app_version} value={APP_VERSION} />
        <Row label="Engine" value={stateMessage(engine)} />
        <Row label="Machine code" value={machineCode() || '–'} preWrap />
      </Card>

      {/* The company mark closes the screen, now that About is no longer a tab. */}
      <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
        <img src={logo} alt="FacePlugin" style={{ height: 44 }} />
      </div>
    </IonContent>
    </IonPage>
  );
}

/** A label, its help line and a switch — the row shape `fragment_settings.xml` uses. */
function SwitchRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: '8px 0',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{help}</div>
      </div>
      <IonToggle
        checked={checked}
        onIonChange={(e) => onChange(e.detail.checked)}
      />
    </div>
  );
}

function UnitSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 14 }}>{label}</div>
        <Pill>{score(value)}</Pill>
      </div>
      <IonRange
        min={min}
        max={max}
        step={0.01}
        value={value}
        onIonInput={(e) => onChange(Number(e.detail.value))}
      />
    </div>
  );
}

function AngleSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 14 }}>{label}</div>
        <Pill>{Math.round(value)}°</Pill>
      </div>
      <IonRange
        min={0}
        max={90}
        step={1}
        value={value}
        onIonInput={(e) => onChange(Number(e.detail.value))}
      />
    </div>
  );
}
