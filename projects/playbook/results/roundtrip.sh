#!/bin/bash
# End-to-end persistence check against a running dev server.
#   npm run dev, then: bash projects/playbook/results/roundtrip.sh
set -e
BASE=${BASE:-http://localhost:3000}

echo "== create =="
CREATE=$(curl -s -X POST "$BASE/api/playbook" -H 'content-type: application/json' \
  -d '{"name":"Varsity 2026","variant":"5flag"}')
ID=$(echo "$CREATE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["book"]["id"])')
TOKEN=$(echo "$CREATE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["editToken"])')
echo "id=$ID"

echo "== add two plays =="
PLAYS=$(cat public/playbook/plays.json)
for i in 0 1; do
  echo "$PLAYS" | python3 -c "
import sys, json
plays = json.load(sys.stdin)
flag = [p for p in plays if p['philosophy'] == 'flag']
spec = flag[$i]
entry = {'play': {'spec': spec, 'lineage': {'rootId': spec['id'], 'parentId': spec['id'], 'rev': 1, 'source': 'library'}},
         'position': ($i + 1) * 10, 'section': 'Openers', 'callNumber': str($i + 1)}
print(json.dumps({'entry': entry}))
" > /tmp/pb_entry.json
  PLAYID=$(python3 -c "import json;print(json.load(open('/tmp/pb_entry.json'))['entry']['play']['spec']['id'])")
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/playbook/$ID/play/$PLAYID" \
    -H 'content-type: application/json' -H "x-playbook-token: $TOKEN" \
    -d @/tmp/pb_entry.json)
  echo "  added $PLAYID -> $CODE"
  [ "$CODE" = "200" ] || { echo "  FAIL: the write was rejected"; exit 1; }
done

echo "== read back =="
CODE=$(curl -s -o /tmp/pb_book.json -w '%{http_code}' "$BASE/api/playbook/$ID")
echo "  GET -> $CODE"
[ "$CODE" = "200" ] || { echo "  FAIL: could not read the playbook back"; head -c 200 /tmp/pb_book.json; exit 1; }
python3 projects/playbook/results/check_book.py /tmp/pb_book.json

echo "== write without the token must be refused =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/playbook/$ID")
echo "  DELETE with no token   -> $CODE (expect 403)"
[ "$CODE" = "403" ] || { echo "  FAIL: an unauthenticated delete succeeded"; exit 1; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/playbook/$ID" -H "x-playbook-token: wrong")
echo "  DELETE with bad token  -> $CODE (expect 403)"
[ "$CODE" = "403" ] || { echo "  FAIL: a wrong token was accepted"; exit 1; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/playbook/$ID")
echo "  GET    with no token   -> $CODE (expect 200 — reads are open)"
[ "$CODE" = "200" ] || { echo "  FAIL: reading a shared book required a token"; exit 1; }

echo "== a formation the coach built survives the round trip =="
FORM='{"formation":{"id":"u_form_rt01","name":"Roundtrip Trips","aliases":[],"strength":"L","qb":{"align":"gun"},"backs":[{"slot":"RB","align":"offset","side":"R","priority":1}],"receivers":[{"slot":"Z","side":"L","order":1,"split":"wide","onLine":true,"priority":2},{"slot":"H","side":"L","order":2,"split":"slot","onLine":false,"priority":3},{"slot":"X","side":"R","order":1,"split":"wide","onLine":true,"priority":4}],"tags":["custom"]}}'
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/playbook/$ID/formation/u_form_rt01" \
  -H 'content-type: application/json' -H "x-playbook-token: $TOKEN" -d "$FORM")
echo "  PUT formation          -> $CODE (expect 200)"
[ "$CODE" = "200" ] || { echo "  FAIL: could not save a formation"; exit 1; }

READ=$(curl -s "$BASE/api/playbook/$ID" | python3 -c "
import sys, json
fs = json.load(sys.stdin)['book'].get('formations', [])
f = next((x for x in fs if x['id'] == 'u_form_rt01'), None)
print(f\"{len(fs)} {f['name'] if f else 'MISSING'} {len(f['receivers']) if f else 0}\")
")
echo "  read back              -> $READ (expect '1 Roundtrip Trips 3')"
[ "$READ" = "1 Roundtrip Trips 3" ] || { echo "  FAIL: formation did not survive"; exit 1; }

# The same token rule the plays get.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/playbook/$ID/formation/u_form_rt01" \
  -H 'content-type: application/json' -d "$FORM")
echo "  PUT with no token      -> $CODE (expect 403)"
[ "$CODE" = "403" ] || { echo "  FAIL: a formation could be written without the token"; exit 1; }

# A formation nothing can draw is refused rather than stored.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/playbook/$ID/formation/u_form_rt02" \
  -H 'content-type: application/json' -H "x-playbook-token: $TOKEN" \
  -d '{"formation":{"id":"u_form_rt02","name":"","aliases":[],"strength":"X","qb":{"align":"nope"},"backs":[],"receivers":[],"tags":[]}}')
echo "  PUT malformed          -> $CODE (expect 400)"
[ "$CODE" = "400" ] || { echo "  FAIL: a malformed formation was accepted"; exit 1; }

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/playbook/$ID/formation/u_form_rt01" -H "x-playbook-token: $TOKEN")
LEFT=$(curl -s "$BASE/api/playbook/$ID" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['book'].get('formations',[])))")
echo "  DELETE                 -> $CODE, $LEFT left (expect 200, 0)"
[ "$CODE" = "200" ] && [ "$LEFT" = "0" ] || { echo "  FAIL: formation delete"; exit 1; }

echo "== share and print routes actually render the book =="
# A 200 is not enough: a missing playbook also renders a 200 saying so.
for path in "/projects/playbook/share/$ID" "/projects/playbook/print/$ID?layout=grid12" \
            "/projects/playbook/print/$ID?layout=callsheet" "/projects/playbook/print/$ID?layout=wristband"; do
  BODY=$(curl -s "$BASE$path")
  SVGS=$(printf '%s' "$BODY" | grep -o '<svg' | wc -l | tr -d ' ')
  NAME=$(printf '%s' "$BODY" | grep -c 'Varsity 2026' || true)
  printf '  %-50s svg=%-4s name=%s\n' "${path#/projects/playbook/}" "$SVGS" "$NAME"
  # Not `could not be found` — Next inlines its own 404 boilerplate into the
  # dev flight payload and that matched every page.
  printf '%s' "$BODY" | grep -q 'That playbook could not be found' \
    && { echo "  FAIL: rendered the not-found branch"; exit 1; }
  [ "$NAME" -gt 0 ] || { echo "  FAIL: playbook name missing from the page"; exit 1; }
  # The call sheet is deliberately names-only; every other sheet draws.
  case "$path" in
    *callsheet*) ;;
    *) [ "$SVGS" -gt 0 ] || { echo "  FAIL: no diagrams rendered"; exit 1; } ;;
  esac
done

echo "== unknown id 404s =="
printf '  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/playbook/ZZZZZZZZZZZZ")"

echo "== cleanup =="
curl -s -X DELETE "$BASE/api/playbook/$ID" -H "x-playbook-token: $TOKEN" > /dev/null
echo "  deleted"
