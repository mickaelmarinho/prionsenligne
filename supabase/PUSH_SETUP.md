# 🔔 Notifications push — Guide de mise en route

Ce guide te dit étape par étape comment activer les notifications push en
production. **Le code est déjà déployé**, il reste 3 actions manuelles :

---

## 1. Migration SQL (Supabase)

Va dans **Supabase → SQL Editor**, ouvre une nouvelle requête, colle le contenu
de `supabase/push_subscriptions.sql` puis clique **Run**.

Ça crée la table `push_subscriptions` avec RLS (Row Level Security) :
chaque utilisateur ne voit/modifie que ses propres souscriptions.

---

## 2. Génération des clés VAPID

Les VAPID keys signent les notifications push pour prouver qu'elles viennent
bien de PrionsEnLigne (le navigateur du destinataire vérifie la signature).

### En local (sur ton poste)

Ouvre un terminal **à la racine du projet** et lance :

```bash
npm install
npx web-push generate-vapid-keys
```

Tu obtiens deux clés :

```
Public Key: BPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...
Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **NE COMMITTE JAMAIS la Private Key.** Elle reste sur ta machine et dans
les env vars Vercel.

---

## 3. Variables d'environnement Vercel

Va dans **Vercel → Settings → Environment Variables** et ajoute :

| Nom                     | Valeur                                         | Scope            |
| ----------------------- | ---------------------------------------------- | ---------------- |
| `VAPID_PUBLIC_KEY`      | (copie la Public Key ci-dessus)                | Production, Preview |
| `VAPID_PRIVATE_KEY`     | (copie la Private Key)                         | Production, Preview |
| `VAPID_SUBJECT`         | `mailto:contact@prionsenligne.fr`              | Production, Preview |
| `CRON_SECRET`           | (génère 32 caractères aléatoires)              | Production, Preview |

Pour `CRON_SECRET`, n'importe quel UUID ou chaîne hex de 32+ caractères fait
l'affaire :

```bash
openssl rand -hex 32
```

(Tu peux aussi en générer un dans https://generate-secret.vercel.app/32)

Vercel passe automatiquement ce secret en header `Authorization: Bearer ...`
quand il déclenche le cron — c'est ce qui protège l'endpoint `/api/cron-push`
des appels non-autorisés.

---

## 4. Cron externe (obligatoire sur plan Vercel Hobby)

⚠️ Le plan **Vercel Hobby** ne permet pas de cron interne plus fréquent qu'**1×
par jour**. Pour que les notifications push partent à l'heure, on délègue le
déclenchement à un service externe gratuit qui appelle `/api/cron-push`
toutes les minutes.

### Service recommandé : cron-job.org (gratuit, fiable)

1. Va sur https://cron-job.org/ et crée un compte gratuit (vérification email)
2. Une fois connecté, clique sur **CREATE CRONJOB** en haut à droite
3. Remplis le formulaire :

| Champ | Valeur |
| --- | --- |
| **Title** | `PrionsEnLigne — Push notifications` |
| **URL** | `https://prionsenligne.fr/api/cron-push` |
| **Schedule** → tab **Common** | Sélectionne **Every minute** |
| **Schedule** → onglet **Custom** (alternative) | Minutes : `* (every minute)` |

4. Va sur l'onglet **Advanced** :

| Champ | Valeur |
| --- | --- |
| **Request method** | **GET** (par défaut) |
| **Request headers** | clique **Add** → Header name : `Authorization` · Header value : `Bearer <ton CRON_SECRET>` |
| **Notify on failure** | OK (te prévient par email si le endpoint plante) |
| **Save responses** | OK (utile pour debug) |

5. **CREATE** en bas

C'est tout. cron-job.org va maintenant déclencher ton endpoint chaque minute.
Tu peux vérifier dans son interface :
- Onglet **History** : succès/échecs des derniers appels
- Onglet **Last execution** : voir le body de réponse `{ "ok": true, ... }`

### Alternative : passer en Pro Vercel

Si tu préfères tout chez Vercel (~$20/mois), passe en plan **Pro**. Le cron
interne défini dans `vercel.json` sera alors accepté. Pour réactiver :

1. Modifie `vercel.json` pour ajouter :
```json
{
  "path": "/api/cron-push",
  "schedule": "* * * * *"
}
```
2. Redéploie

---

## 5. Redéploiement

Une fois les env vars ajoutées, **redéploie le projet** depuis Vercel
(Deployments → … → Redeploy) pour que les nouvelles variables soient prises
en compte.

---

## 6. Test end-to-end

1. Ouvre le site, connecte-toi
2. Va dans ton **profil → section « Notifications push »**
3. Clique **Activer les notifications** → accorde la permission
4. Coche au moins un type d'office (ex : Chapelets) + au moins un pays
5. Clique **Enregistrer**

Le bandeau de feedback doit indiquer un nombre de notifications planifiées
sur les 7 prochains jours.

Pour tester rapidement : sélectionne un type d'office dont tu sais qu'il y a
un créneau dans les 30 prochaines minutes, puis attends. La notification
arrive 10 min avant.

### Vérifier que le cron tourne

Va dans **Vercel → Logs** et filtre par `/api/cron-push`. Tu dois voir une
exécution chaque minute, avec un JSON de réponse :

```json
{ "ok": true, "subscriptions": 1, "sent": 0, "errors": 0, "deleted": 0 }
```

---

## Architecture résumée

```
┌─────────────────┐
│ Client (browser)│
│ - Profil "Push" │
│ - Subscribe     │
│ - computeNext   │  ← calcule les 7 prochains jours d'offices
│   Pushes()      │     selon les filtres choisis
└────────┬────────┘
         │ upsert via Supabase (RLS)
         ▼
┌──────────────────────────────┐
│ Supabase: push_subscriptions │
│ - endpoint, p256dh, auth     │
│ - lead_min, types, countries │
│ - next_pushes (jsonb)        │  ← liste précalculée [{at, label, ...}]
└────────┬─────────────────────┘
         │ lu chaque minute par
         ▼
┌─────────────────────────────────────┐
│ Vercel cron /api/cron-push (1/min)  │
│ - Filtre next_pushes par fenêtre    │
│ - web-push (VAPID-signed)           │
│ - Nettoie next_pushes (sent/expiré) │
└────────┬────────────────────────────┘
         │ Web Push (FCM / Mozilla / etc.)
         ▼
┌────────────────────────┐
│ Service Worker         │
│ event 'push' →         │
│ showNotification()     │
└────────────────────────┘
```

---

## Limites connues

- **Safari iOS** : Web Push fonctionne uniquement sur iOS 16.4+ ET seulement
  si l'utilisateur a **ajouté le PWA à l'écran d'accueil**. Tant que c'est
  une page Safari classique, l'API n'est pas exposée.
- **Désinstallation de l'app** : le navigateur invalide la souscription. Le
  cron détecte les erreurs HTTP 410/404 et nettoie automatiquement.
- **Changement de prefs** : ré-enregistre les 7 prochains jours à chaque
  sauvegarde. Pas de mise à jour incrémentale.
- **Schedule overrides admin** : si tu modifies un horaire après que les
  pushes ont été calculés, l'utilisateur recevra l'ancien créneau jusqu'à
  ce qu'il re-sauvegarde. Solution : recompute automatique au prochain
  load de l'app (déjà fait).
- **Quota Vercel cron** : 1 invocation/min sur Hobby plan = quota dépassé
  selon le plan. Vérifie ton usage si tu es sur Hobby gratuit (Pro $20/mois
  recommandé pour le push).
