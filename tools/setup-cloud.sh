#!/bin/bash
# 처음 한 번만: Google Cloud Shell(https://shell.cloud.google.com)에서 실행해요.
#  - 서버 기능에 필요한 Google API를 켜고
#  - GitHub(shgusdn56/diary의 main 브랜치)만 Firebase에 서버를 올릴 수 있게 연결해요(비밀 키 파일 없음)
# Firebase 요금제를 Blaze로 올린 뒤에 실행해 주세요. 여러 번 실행해도 괜찮아요.
set -u
P=life-diary-1c3b8; N=500724626014; SA=github-deploy@$P.iam.gserviceaccount.com; REPO=shgusdn56/diary
gcloud config set project $P >/dev/null
echo "1/4 API 켜는 중… (몇 분 걸릴 수 있어요)"
gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com \
  eventarc.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com fcm.googleapis.com fcmregistrations.googleapis.com \
  firebaseinstallations.googleapis.com firebaserules.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com iam.googleapis.com firestore.googleapis.com || { echo "API를 켜지 못했어요. Blaze 요금제인지 확인해 주세요."; exit 1; }
echo "2/4 올리기 전용 계정 만드는 중…"
gcloud iam service-accounts describe $SA >/dev/null 2>&1 || gcloud iam service-accounts create github-deploy --display-name="GitHub에서 Firebase 올리기"
for R in roles/editor roles/iam.serviceAccountUser roles/resourcemanager.projectIamAdmin roles/run.admin roles/cloudfunctions.admin roles/firebaserules.admin; do
  gcloud projects add-iam-policy-binding $P --member=serviceAccount:$SA --role=$R --condition=None >/dev/null && echo "  권한 $R"
done
# 서버 코드 만들기(Cloud Build)에 쓰는 기본 계정 권한
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$N-compute@developer.gserviceaccount.com --role=roles/cloudbuild.builds.builder --condition=None >/dev/null
echo "3/4 GitHub 연결 만드는 중…"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 || gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers describe diary --location=global --workload-identity-pool=github >/dev/null 2>&1 || \
gcloud iam workload-identity-pools providers create-oidc diary --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" >/dev/null
echo "4/4 확인"
echo "  Firestore 위치: $(gcloud firestore databases describe --database='(default)' --format='value(locationId)')"
echo "끝났어요. 이제 Claude에게 '설정 끝'이라고 알려 주세요."
