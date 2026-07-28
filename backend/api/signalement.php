<?php

ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app"); // ⚠️ REMPLACEZ par votre vraie URL Vercel
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Si c'est une requête de pré-vérification (OPTIONS), on arrête le script immédiatement
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}


// ============================================
// ClearWay Bénin - API Signalement
// Reçoit le formulaire (multipart/form-data, à cause de la photo) et l'enregistre
// Sans compte requis - cf. maquette écran 02
// ============================================

header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__) . '/config/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erreur' => 'Méthode non autorisée. Utilise POST.']);
    exit;
}

// Les données arrivent en multipart/form-data (FormData côté JS, à cause de la photo)
$typeObstacle             = $_POST['type_obstacle'] ?? null;
$typeObstaclePersonnalise = trim($_POST['type_obstacle_personnalise'] ?? '');
$gravite                  = $_POST['gravite'] ?? null;
$description              = trim($_POST['description'] ?? '');

// ---- Localisation : obligatoire, fournie soit par la géolocalisation du
// navigateur ("Utiliser ma position"), soit par un point choisi sur la carte
// ("Choisir sur la carte"). Il n'y a plus de liste de zones : latitude/longitude
// sont la donnée de référence, le reste (pays/ville/quartier/adresse) est
// indicatif et vient du géocodage inversé fait côté client. ----
$latitude       = null;
$longitude      = null;
$accuracy       = null;
$sourcePosition = $_POST['source_position'] ?? null;
$pays           = trim($_POST['pays'] ?? '');
$ville          = trim($_POST['ville'] ?? '');
$quartier       = trim($_POST['quartier'] ?? '');
$adresseFormatee = trim($_POST['adresse_formatee'] ?? '');

if (isset($_POST['latitude'], $_POST['longitude'])
    && is_numeric($_POST['latitude']) && is_numeric($_POST['longitude'])) {
    $latBrut = (float) $_POST['latitude'];
    $lonBrut = (float) $_POST['longitude'];
    // Garde-fou : rejette silencieusement une position hors des coordonnées
    // GPS valides plutôt que de faire échouer tout le signalement pour ça
    if ($latBrut >= -90 && $latBrut <= 90 && $lonBrut >= -180 && $lonBrut <= 180) {
        $latitude = $latBrut;
        $longitude = $lonBrut;
    }
}

if (isset($_POST['accuracy']) && is_numeric($_POST['accuracy'])) {
    $accuracy = (float) $_POST['accuracy'];
}

// ---- Validation minimale des champs obligatoires ----
$typesValides       = ['Inondation', 'Accident', 'Travaux', 'Autre'];
$gravitesValides    = ['Leger', 'Modere', 'Severe'];
$sourcesValides     = ['GPS', 'CARTE'];

$erreurs = [];
if ($latitude === null || $longitude === null) {
    $erreurs[] = "L'emplacement est obligatoire : utilise ta position ou choisis un point sur la carte.";
}
if (empty($sourcePosition) || !in_array($sourcePosition, $sourcesValides, true)) {
    $erreurs[] = "L'origine de la position est invalide.";
}
if (empty($typeObstacle) || !in_array($typeObstacle, $typesValides, true)) {
    $erreurs[] = 'Le champ Type d\'obstacle est obligatoire.';
}
if ($typeObstacle === 'Autre' && $typeObstaclePersonnalise === '') {
    $erreurs[] = 'Précise le type d\'obstacle.';
}
if (empty($gravite) || !in_array($gravite, $gravitesValides, true)) {
    $erreurs[] = 'La sévérité est obligatoire (Léger, Modéré ou Sévère).';
}
if ($description === '') {
    $erreurs[] = 'La description est obligatoire.';
}
if (!isset($_FILES['photo']) || $_FILES['photo']['error'] === UPLOAD_ERR_NO_FILE) {
    $erreurs[] = 'La photo est obligatoire.';
}

if (!empty($erreurs)) {
    http_response_code(400);
    echo json_encode(['erreur' => implode(' ', $erreurs)]);
    exit;
}

// ---- Si le type d'obstacle est précisé manuellement, on l'ajoute au début de la description ----
if ($typeObstacle === 'Autre' && $typeObstaclePersonnalise !== '') {
    $description = "[{$typeObstaclePersonnalise}] {$description}";
}

// ---- Traitement de la photo (optionnelle) ----
$photoNomFichier = null;

if (isset($_FILES['photo']) && $_FILES['photo']['error'] !== UPLOAD_ERR_NO_FILE) {

    if ($_FILES['photo']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['erreur' => "Échec de l'envoi de la photo."]);
        exit;
    }

    $tailleMaxOctets = 5 * 1024 * 1024; // 5 Mo
    if ($_FILES['photo']['size'] > $tailleMaxOctets) {
        http_response_code(400);
        echo json_encode(['erreur' => 'La photo dépasse la taille maximale autorisée (5 Mo).']);
        exit;
    }

    // Vérifie le vrai type du fichier (pas seulement l'extension) pour la sécurité
    $typesAutorises = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];
    $typeReel = mime_content_type($_FILES['photo']['tmp_name']);

    if (!isset($typesAutorises[$typeReel])) {
        http_response_code(400);
        echo json_encode(['erreur' => 'Format de photo non supporté (JPEG, PNG ou WEBP uniquement).']);
        exit;
    }

    $extension = $typesAutorises[$typeReel];
    $photoNomFichier = bin2hex(random_bytes(16)) . '.' . $extension;
    $cheminDestination = __DIR__ . '/../uploads/' . $photoNomFichier;

    if (!move_uploaded_file($_FILES['photo']['tmp_name'], $cheminDestination)) {
        http_response_code(500);
        echo json_encode(['erreur' => "Impossible d'enregistrer la photo."]);
        exit;
    }
}

// ---- Insertion du signalement ----
$stmt = $pdo->prepare("
    INSERT INTO signalements (
        type_obstacle, gravite, description,
        latitude, longitude, accuracy, source_position, pays, ville, quartier, adresse_formatee,
        photo, statut, date_creation
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'actif', NOW())
");
$stmt->execute([
    $typeObstacle,
    $gravite,
    $description !== '' ? $description : null,
    $latitude,
    $longitude,
    $accuracy,
    $sourcePosition,
    $pays !== '' ? $pays : null,
    $ville !== '' ? $ville : null,
    $quartier !== '' ? $quartier : null,
    $adresseFormatee !== '' ? $adresseFormatee : null,
    $photoNomFichier,
]);

$signalementId = (int) $pdo->lastInsertId();

// ---- Répond immédiatement à l'utilisateur : le signalement est déjà enregistré avec succès ----
// Les notifications sont un "bonus" — leur éventuel échec ne doit JAMAIS faire croire
// à l'utilisateur que son signalement n'est pas passé.
$reponseJson = json_encode([
    'succes' => true,
    'id' => $signalementId,
    'message' => 'Signalement envoyé avec succès.',
]);

// Technique pour renvoyer la réponse tout de suite et continuer le script après
// (l'utilisateur n'attend pas que les notifications partent)
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) {
    echo $reponseJson;
    fastcgi_finish_request();
} else {
    header('Content-Length: ' . strlen($reponseJson));
    header('Connection: close');
    echo $reponseJson;
    if (ob_get_level() > 0) {
        ob_end_flush();
    }
    flush();
}

// ---- Notifie les abonnés (Écran 05) — protégé : ne doit jamais faire planter l'API ----
try {
    require_once __DIR__ . '/../lib/WebPush.php';
    require_once __DIR__ . '/../config/vapid.php';

    $stmtZoneNom = $pdo->prepare("SELECT quartier, ville FROM signalements WHERE id = ?");
    $stmtZoneNom->execute([$signalementId]);
    $ligne = $stmtZoneNom->fetch();
    $nomZone = ($ligne['quartier'] ?: $ligne['ville']) ?: 'une zone';

    $graviteLabelsNotif = ['Leger' => 'léger', 'Modere' => 'modéré', 'Severe' => 'sévère'];
    $payloadNotification = json_encode([
        'titre' => 'ClearWay Bénin',
        'message' => $nomZone . ' bloquée — ' . strtolower($typeObstacle) . ' ' . $graviteLabelsNotif[$gravite],
    ]);

    $webpush = new WebPush(VAPID_CLE_PUBLIQUE, VAPID_CLE_PRIVEE, VAPID_SUBJECT);

    // ---- Alertes push UNIQUEMENT dans un rayon de 5 km ----
    // On ne récupère que les abonnés dont la position connue est à moins de
    // 5 km de CE signalement (formule de Haversine). Un abonné sans position
    // enregistrée (latitude/longitude NULL, géolocalisation refusée lors de
    // l'activation) n'est jamais notifié : on ne peut pas savoir s'il est
    // concerné, donc par prudence on ne le dérange pas.
    $abonnements = [];
    if ($latitude !== null && $longitude !== null) {
        $stmtAbonnements = $pdo->prepare("
            SELECT id, endpoint, p256dh, auth_secret
            FROM push_subscriptions
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND (
                  6371 * ACOS(
                      COS(RADIANS(:lat1)) * COS(RADIANS(latitude)) *
                      COS(RADIANS(longitude) - RADIANS(:lng1)) +
                      SIN(RADIANS(:lat2)) * SIN(RADIANS(latitude))
                  )
              ) <= 5
        ");
        $stmtAbonnements->bindValue(':lat1', $latitude);
        $stmtAbonnements->bindValue(':lat2', $latitude);
        $stmtAbonnements->bindValue(':lng1', $longitude);
        $stmtAbonnements->execute();
        $abonnements = $stmtAbonnements->fetchAll();
    }

    foreach ($abonnements as $abonnement) {
        try {
            $resultat = $webpush->envoyerNotification([
                'endpoint' => $abonnement['endpoint'],
                'p256dh' => $abonnement['p256dh'],
                'auth' => $abonnement['auth_secret'],
            ], $payloadNotification);

            if ($resultat['expire']) {
                $pdo->prepare("DELETE FROM push_subscriptions WHERE id = ?")->execute([$abonnement['id']]);
            }
        } catch (\Throwable $e) {
            // Un abonné en échec ne doit pas empêcher les autres d'être notifiés
            error_log('Échec envoi notification signalement ' . $signalementId . ' : ' . $e->getMessage());
        }
    }
} catch (\Throwable $e) {
    // Table absente, clé VAPID invalide, etc. -> le signalement reste un succès malgré tout
    error_log('Notifications indisponibles pour le signalement ' . $signalementId . ' : ' . $e->getMessage());
}