# LINE setup

1. LINE Official AccountとMessaging API channelを作成します。
2. `LINE_CHANNEL_SECRET`をSupabase Edge Function Secretへ登録します。
3. `line-webhook`をdeployしWebhook URLを設定します。
4. 対象groupIdをOwnerが`line_groups`へ登録してBotを追加します。

Staging webhook URLは`https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/line-webhook`です。LINE Developersで「グループ・複数人トークへの参加を許可」とWebhook利用を有効にし、自動応答メッセージは無効にします。署名テストで実Channel Secretをshellへ表示せず、LINE PlatformのWebhook検証とcontrolled replayを使用してください。

Functionはraw bodyをHMAC-SHA256検証してからJSON parseします。不一致は401です。同一`line_message_id`はUNIQUE違反を正常な再送として200で処理します。通常メッセージへ返信しません。InboxのTask/Event化はAdmin/Ownerによる手動操作だけで、RPCが`source_type=line`と`source_id=line_messages.id`を保存します。
