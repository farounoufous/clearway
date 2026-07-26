<?php
// backend/fpm-env.php
// Préchargé automatiquement sur CHAQUE requête par le serveur intégré PHP
// (voir railpack.json : "auto_prepend_file=fpm-env.php"). Applique les en-têtes
// CORS globalement avant que le routeur ne dispatche vers index.php ou api/*.php.
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}