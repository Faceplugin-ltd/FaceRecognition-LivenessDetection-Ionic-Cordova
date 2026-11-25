import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
  IonSearchbar,
  useIonActionSheet,
  useIonAlert,
  useIonToast,
} from '@ionic/react';
import {
  addOutline,
  chevronForwardOutline,
  ellipsisVertical,
  peopleOutline,
} from 'ionicons/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { enrolledDate, idTag } from '../format';
import * as gallery from '../data/gallery';
import type { FaceRecord } from '../data/gallery';
import { colors, FaceImage, Pill } from '../ui/components';
import PersonSheet from '../ui/PersonSheet';
import { ResultStore } from '../data/resultStore';
import { pickFolderImages, pickImages } from '../pickImage';
import { S } from '../strings';

const PAGE_SIZE = 30;

/** People: count tag, Add person, ⋮ (Delete all faces), search, and the paged list. */
export default function PeoplePage() {
  const history = useHistory();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [presentSheet] = useIonActionSheet();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();

  useEffect(() => gallery.subscribe(() => setVersion((v) => v + 1)), []);

  const total = useMemo(() => {
    void version;
    return gallery.count();
  }, [version]);

  const items: FaceRecord[] = useMemo(() => {
    void version;
    return gallery.page(query, limit, 0);
  }, [query, limit, version]);

  const filtered = useMemo(() => {
    void version;
    return gallery.count(query);
  }, [query, version]);

  const addPhotos = useCallback(async () => {
    const paths = await pickImages();
    if (paths.length === 0) {
      void presentToast({
        message: 'No photos selected.',
        duration: 2000,
      });
      return;
    }
    ResultStore.importPaths = paths;
    history.push('/import', { paths });
  }, [history, presentToast]);

  const addFolder = useCallback(async () => {
    const paths = await pickFolderImages();
    if (paths.length === 0) {
      void presentToast({
        message: 'No images found in that folder.',
        duration: 2000,
      });
      return;
    }
    ResultStore.importPaths = paths;
    history.push('/import', { paths });
  }, [history, presentToast]);

  /** Android `PeopleFragment.chooseMultipleSource` — alert list, not a nested action sheet. */
  const chooseMultipleSource = useCallback(() => {
    window.setTimeout(() => {
      void presentAlert({
        header: S.add_multiple,
        cssClass: 'fp-alert fp-alert-list',
        buttons: [
          {
            text: S.select_photos,
            handler: () => {
              window.setTimeout(() => void addPhotos(), 200);
            },
          },
          {
            text: S.select_folder,
            handler: () => {
              window.setTimeout(() => void addFolder(), 200);
            },
          },
          { text: S.cancel, role: 'cancel' },
        ],
      });
    }, 280);
  }, [addFolder, addPhotos, presentAlert]);

  const showAddMenu = () =>
    void presentSheet({
      header: S.txt_add_person,
      cssClass: 'fp-action-sheet',
      buttons: [
        {
          text: S.add_one_person,
          handler: () => {
            window.setTimeout(() => history.push('/add-person'), 50);
          },
        },
        {
          text: S.add_multiple,
          handler: () => chooseMultipleSource(),
        },
        { text: S.cancel, role: 'cancel' },
      ],
    });

  const confirmDeleteAll = () => {
    const n = gallery.count();
    if (n === 0) {
      void presentToast({
        message: 'There is nothing to delete.',
        duration: 2000,
      });
      return;
    }
    void presentAlert({
      header: 'Delete all faces',
      message: `Delete all ${n} enrolled ${n === 1 ? 'face' : 'faces'} and their photos? This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete all',
          role: 'destructive',
          handler: () => {
            void gallery.removeAll().then((deleted) =>
              presentToast({
                message: `Deleted ${deleted} ${deleted === 1 ? 'face' : 'faces'}`,
                duration: 2000,
              })
            );
          },
        },
      ],
    });
  };

  return (
    <IonPage>
    <IonContent>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>People</div>
          <Pill>{total}</Pill>
          <div style={{ flex: 1 }} />
          <IonButton size="small" onClick={showAddMenu}>
            <IonIcon slot="start" icon={addOutline} />
            Add person
          </IonButton>
          <IonButton
            size="small"
            fill="clear"
            onClick={confirmDeleteAll}
            aria-label="Delete all faces"
          >
            <IonIcon slot="icon-only" icon={ellipsisVertical} />
          </IonButton>
        </div>

        <IonSearchbar
          value={query}
          debounce={250}
          placeholder="Search name or note"
          onIonInput={(e) => {
            setQuery(String(e.detail.value ?? ''));
            setLimit(PAGE_SIZE);
          }}
          style={{ paddingInline: 0 }}
        />
      </div>

      {filtered === 0 ? (
        <Empty searching={query.trim() !== ''} />
      ) : (
        <div style={{ padding: '0 16px 24px' }}>
          {items.map((r) => (
            <div
              key={r.id}
              onClick={() => setOpenId(r.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--fp-outline-variant)',
                cursor: 'pointer',
              }}
            >
              {/* 48dp circle, name, note · date, ID tag and a chevron —
                  Android `item_gallery_person.xml`. */}
              <FaceImage path={r.cropPath} size={48} round />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 16,
                    color: 'var(--fp-on-surface)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--fp-on-surface-variant)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.note
                    ? `${r.note} · ${enrolledDate(r.createdAt)}`
                    : enrolledDate(r.createdAt)}
                </div>
              </div>
              <Pill size={11}>{idTag(r.id)}</Pill>
              <IonIcon
                icon={chevronForwardOutline}
                style={{ fontSize: 20, color: 'var(--fp-outline)' }}
              />
            </div>
          ))}

          {items.length < filtered && (
            <IonButton
              expand="block"
              fill="clear"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              Show more
            </IonButton>
          )}
        </div>
      )}

      <PersonSheet id={openId} onClose={() => setOpenId(null)} />
    </IonContent>
    </IonPage>
  );
}

function Empty({ searching }: { searching: boolean }) {
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <IonIcon
        icon={peopleOutline}
        style={{ fontSize: 48, opacity: 0.5, color: colors.accent }}
      />
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 12 }}>
        {searching ? 'No results' : 'No one is enrolled yet'}
      </div>
      {!searching && (
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
          Add a person to search against. Identify compares a probe face with everyone here.
        </div>
      )}
    </div>
  );
}
