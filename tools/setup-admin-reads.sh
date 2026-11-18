#!/usr/bin/env bash
# 관리자 열람 알림 켜기 (Cloud Shell에서 한 번만 실행)
#  1) Firestore '자료 읽기' 감사 로그를 켜요 — 누가(Google 계정) 언제 어떤 자료를 읽었는지 Google이 기록
#  2) 그 기록은 기본 로그 보관함에 쌓지 않아요(요금 없게) — 대신 아래 연결로만 보내요
#  3) 사람 계정(서비스 계정 제외)이 읽은 기록만 Pub/Sub 'admin-reads'로 보내요 → 서버 기능 adminReads가 알림·메일·기록
# 일지 앱으로 평소 읽고 쓰는 건 Firebase 로그인 요청이라 사람 계정(principalEmail)이 없어서 여기 걸리지 않아요.
set -euo pipefail
P=life-diary-1c3b8
gcloud config set project "$P" >/dev/null

echo "▶ 필요한 기능 켜기"
gcloud services enable pubsub.googleapis.com logging.googleapis.com >/dev/null

echo "▶ Firestore 자료 읽기 감사 로그 켜기"
TMP=$(mktemp)
gcloud projects get-iam-policy "$P" --format=json > "$TMP"
python3 - "$TMP" <<'PY'
import json, sys
p = sys.argv[1]; pol = json.load(open(p))
cfgs = pol.setdefault('auditConfigs', [])
for svc in ('firestore.googleapis.com', 'datastore.googleapis.com'):
    c = next((x for x in cfgs if x.get('service') == svc), None)
    if c is None: c = {'service': svc, 'auditLogConfigs': []}; cfgs.append(c)
    if not any(l.get('logType') == 'DATA_READ' for l in c['auditLogConfigs']): c['auditLogConfigs'].append({'logType': 'DATA_READ'})
json.dump(pol, open(p, 'w'))
PY
gcloud projects set-iam-policy "$P" "$TMP" --format=none
rm -f "$TMP"

AUDIT='logName="projects/'"$P"'/logs/cloudaudit.googleapis.com%2Fdata_access" AND (protoPayload.serviceName="firestore.googleapis.com" OR protoPayload.serviceName="datastore.googleapis.com")'

echo "▶ 기본 로그 보관함에는 쌓지 않기(요금 없게)"
gcloud logging sinks update _Default --remove-exclusions=fs-data-access >/dev/null 2>&1 || true
gcloud logging sinks update _Default --add-exclusion=name=fs-data-access,filter="$AUDIT" >/dev/null

echo "▶ 알림 통로(Pub/Sub admin-reads) 만들기"
gcloud pubsub topics describe admin-reads >/dev/null 2>&1 || gcloud pubsub topics create admin-reads >/dev/null

echo "▶ 사람 계정이 읽은 기록만 알림 통로로 보내기"
FILTER="$AUDIT"' AND protoPayload.authenticationInfo.principalEmail:"@" AND NOT protoPayload.authenticationInfo.principalEmail:"gserviceaccount.com"'
if gcloud logging sinks describe admin-reads >/dev/null 2>&1; then
  gcloud logging sinks update admin-reads "pubsub.googleapis.com/projects/$P/topics/admin-reads" --log-filter="$FILTER" >/dev/null
else
  gcloud logging sinks create admin-reads "pubsub.googleapis.com/projects/$P/topics/admin-reads" --log-filter="$FILTER" >/dev/null
fi
W=$(gcloud logging sinks describe admin-reads --format='value(writerIdentity)')
gcloud pubsub topics add-iam-policy-binding admin-reads --member="$W" --role=roles/pubsub.publisher >/dev/null

echo ""
echo "✅ 끝났어요. 이제 Claude에게 '설정 끝났어'라고 알려 주세요."
