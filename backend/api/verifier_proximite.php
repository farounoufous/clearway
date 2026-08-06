<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

header('Content-Type: application/json; charset=utf-8');
const RAYON_METRES = 200;
const LIMITE_RESULTATS = 5;

$latitude = filter_input(INPUT_GET, 'lat', FILTER_VALIDATE_FLOAT);
$longitude = filter_input(INPUT_GET, 'lng', FILTER_VALIDATE_FLOAT);

if ($latitude === false || $latitude === null || $longitude === false || $longitude === null) {
    http_response_code(400);
    echo json_encode(['succes' => false, 'erreur' => 'Latitude/longitude invalides.', 'doublons_possibles' => []]);
    exit;
}
if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
    http_response_code(400);
    echo json_encode(['succes' => false, 'erreur' => 'Coordonnées hors limites.', 'doublons_possibles' => []]);
    exit;
}

require_once dirname(__DIR__) . '/config/db.php';

$rayonKm = RAYON_METRES / 1000;

$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.date_creation, s.statut, s.valide,
           s.pays, s.ville, s.quartier, s.adresse_formatee, s.latitude, s.longitude,
           (SELECT COUNT(DISTINCT COALESCE(c.visiteur_id, c.ip_utilisateur))
              FROM confirmations c
             WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations,
           (
               6371 * ACOS(
                   COS(RADIANS(:lat1)) * COS(RADIANS(s.latitude)) *
                   COS(RADIANS(s.longitude) - RADIANS(:lng1)) +
                   SIN(RADIANS(:lat2)) * SIN(RADIANS(s.latitude))
               )
           ) AS distance_km
    FROM signalements s
    WHERE s.statut IN ('actif', 'incertain')
      AND s.latitude IS NOT NULL
      AND s.longitude IS NOT NULL
    HAVING distance_km <= :rayon
    ORDER BY distance_km ASC
    LIMIT " . LIMITE_RESULTATS . "
";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':lat1' => $latitude,
    ':lng1' => $longitude,
    ':lat2' => $latitude,
    ':rayon' => $rayonKm,
]);
$candidats = $stmt->fetchAll();

function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
}

function graviteLabel($gravite) {
    return match ($gravite) {
        'Severe' => 'sévère',
        'Modere' => 'modéré',
        'Praticable' => 'praticable',
        default => 'léger',
    };
}

function confiance($s) {
    if ((bool) $s['valide']) return 'validee';
    if ((int) $s['nb_confirmations'] > 0) return 'confirmee_partiellement';
    if ($s['statut'] === 'incertain') return 'incertain';
    return 'recente';
}

function dureeEcoulee($date) {
    $minutes = max(0, floor((time() - strtotime($date)) / 60));
    if ($minutes < 1) return "à l'instant";
    if ($minutes < 60) return $minutes . ' min';
    $heures = floor($minutes / 60);
    $reste = $minutes % 60;
    return $heures . 'h' . str_pad($reste, 2, '0', STR_PAD_LEFT);
}

$doublonsPossibles = array_map(function ($s) {
    return [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'type_obstacle' => $s['type_obstacle'],
        'gravite_label' => graviteLabel($s['gravite']),
        'confiance' => confiance($s),
        'depuis' => dureeEcoulee($s['date_creation']),
        'distance_m' => (int) round(((float) $s['distance_km']) * 1000),
    ];
}, $candidats);

echo json_encode([
    'succes' => true,
    'nb_resultats' => count($doublonsPossibles),
    'rayon_metres' => RAYON_METRES,
    'doublons_possibles' => $doublonsPossibles,
]);