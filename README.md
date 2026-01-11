# TopicsLog — Notes Zen (Dark) [GitHub Pages]

This zip is pre-configured for your Firebase project **notes-zen**.

## What it does
- User ID + Password login (no email/phone in UI)
- Topics (owned + shared)
- Notes rows: Date, Title, Rich-text Notes
- Share topic by User ID
- Export CSV
- Offline cache (Firestore persistence + service worker)
- Storage/attachments disabled (no billing)

## Firebase Console Checklist
1) Authentication → Sign-in method → Enable **Email/Password**
2) Firestore Database → Create (Standard, Database ID `(default)`)
3) Authentication → Settings → Authorized domains → Add:
   - `zen-tech-soul.github.io`

## GitHub Pages steps
1) Create a repo (example: `topicslog`)
2) Upload all files (index.html must be in repo root)
3) Settings → Pages → main → /(root)

Your site becomes:
`https://zen-tech-soul.github.io/<REPO_NAME>/`

## Firestore rules (secure after testing)
Firestore → Rules → Publish:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    match /userIndex/{userIdLower} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.resource.data.uid == request.auth.uid;
    }

    match /topics/{topicId} {
      allow read: if request.auth != null && request.auth.uid in resource.data.allowedUids;
      allow create: if request.auth != null
                    && request.resource.data.ownerUid == request.auth.uid
                    && request.auth.uid in request.resource.data.allowedUids;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.ownerUid;

      match /rows/{rowId} {
        allow read: if request.auth != null
                    && request.auth.uid in get(/databases/$(database)/documents/topics/$(topicId)).data.allowedUids;
        allow create, update: if request.auth != null
                              && request.auth.uid in get(/databases/$(database)/documents/topics/$(topicId)).data.allowedUids;
        allow delete: if request.auth != null
                      && request.auth.uid == get(/databases/$(database)/documents/topics/$(topicId)).data.ownerUid;
      }
    }
  }
}
