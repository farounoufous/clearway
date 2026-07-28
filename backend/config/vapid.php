<?php
// Clé PUBLIQUE — utilisée côté frontend (js/notifications.js) pour s'abonner
define('VAPID_CLE_PUBLIQUE', 'BNR9zjMkuQjAYjtDMbCes8M5_VH0Dx9qRCUlkYLc7KfbKiwWzc2Re_Avs4bfJDjjc-qk8KgQFViVIhyjeq8vFtY');

// Clé PRIVÉE — reste strictement côté serveur, ne jamais exposer au frontend
define('VAPID_CLE_PRIVEE', 'j0khBnTFZhqD2RiiQ1J247Pedz4MzYuCwdKXDZimURE');

// Identifie ton projet auprès des services de push (Google/Mozilla) — remplace par un vrai contact
define('VAPID_SUBJECT', 'mailto:contact@clearway-benin.bj');
