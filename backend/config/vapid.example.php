<?php
// ============================================
// ClearWay Bénin - Modèle de configuration VAPID
// Copie ce fichier en "vapid.php". Génère tes propres clés une seule fois
// avec WebPush::genererClesVapid() — ne jamais versionner les vraies clés,
// la clé privée doit rester strictement secrète.
// ============================================

define('VAPID_CLE_PUBLIQUE', 'TA_CLE_PUBLIQUE_ICI');
define('VAPID_CLE_PRIVEE', 'TA_CLE_PRIVEE_ICI');
define('VAPID_SUBJECT', 'mailto:ton-email@example.com');
