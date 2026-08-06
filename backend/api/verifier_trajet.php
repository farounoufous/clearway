<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

header('Content-Type: application/json; charset=utf-8');

const CORRIDOR_KM = 0.6;
const MARGE_EXTREMITES = 0.1; // 10 % de la longueur du trajet de chaque côté

const LIMITE_RESULTATS = 50;
$parametres = ['lat_depart', 'lng_depart', 'lat_arrivee', 'lng_arrivee'];
$valeurs = [];

foreach ($parametres as $nom) {
    if (!isset($_GET[$nom]) || $_GET[$nom] === '') {
        http_response_code(400);
        echo json_encode([
            'succes' => false,
            'erreur' => "Paramètre manquant : '$nom'.",
            'signalements' => [],
        ]);
        exit;
    }
    $valeur = filter_var($_GET[$nom], FILTER_VALIDATE_FLOAT);
    if ($valeur === false) {
        http_response_code(400);
        echo json_encode([
            'succes' => false,
            'erreur' => "Le paramètre '$nom' doit être un nombre décimal valide.",
            'signalements' => [],
        ]);
        exit;
    }
    $valeurs[$nom] = $valeur;
}

$latDepart  = $valeurs['lat_depart'];
$lngDepart  = $valeurs['lng_depart'];
$latArrivee = $valeurs['lat_arrivee'];
$lngArrivee = $valeurs['lng_arrivee'];

foreach ([$latDepart, $latArrivee] as $lat) {
    if ($lat < -90 || $lat > 90) {
        http_response_code(400);
        echo json_encode(['succes' => false, 'erreur' => 'Latitude hors limites.', 'signalements' => []]);
        exit;
    }
}
foreach ([$lngDepart, $lngArrivee] as $lng) {
    if ($lng < -180 || $lng > 180) {
        http_response_code(400);
        echo json_encode(['succes' => false, 'erreur' => 'Longitude hors limites.', 'signalements' => []]);
        exit;
    }
}

require_once dirname(__DIR__) . '/config/db.php';


function projeterEnPlanLocal(float $lat, float $lng, float $latOrigine, float $lngOrigine, float $kmParDegLat, float $kmParDegLng): array {
    return [
        ($lng - $lngOrigine) * $kmParDegLng,
        ($lat - $latOrigine) * $kmParDegLat,
    ];
}

function distanceEtPositionSurSegment(float $px, float $py, float $ax, float $ay, float $bx, float $by): array {
    $dx = $bx - $ax;
    $dy = $by - $ay;
    $longueurCarree = $dx * $dx + $dy * $dy;

    if ($longueurCarree < 0.0001) {
        // Départ et arrivée quasi identiques
        $distance = sqrt(($px - $ax) ** 2 + ($py - $ay) ** 2);
        return [$distance, 0.0];
    }

    $t = (($px - $ax) * $dx + ($py - $ay) * $dy) / $longueurCarree;
    $tClamp = max(0.0, min(1.0, $t));

    $projX = $ax + $tClamp * $dx;
    $projY = $ay + $tClamp * $dy;

    $distance = sqrt(($px - $projX) ** 2 + ($py - $projY) ** 2);

    return [$distance, $t];
}
$latRef = ($latDepart + $latArrivee) / 2;
$kmParDegLat = 111.32;
$kmParDegLng = 111.32 * cos(deg2rad($latRef));

[$ax, $ay] = projeterEnPlanLocal($latDepart, $lngDepart, $latDepart, $lngDepart, $kmParDegLat, $kmParDegLng);
[$bx, $by] = projeterEnPlanLocal($latArrivee, $lngArrivee, $latDepart, $lngDepart, $kmParDegLat, $kmParDegLng);

$latMin = min($latDepart, $latArrivee) - 0.05; // ~5 km de marge
$latMax = max($latDepart, $latArrivee) + 0.05;
$lngMin = min($lngDepart, $lngArrivee) - 0.05;
$lngMax = max($lngDepart, $lngArrivee) + 0.05;

$sql = "
    SELECT s.id, s.type_obstacle, s.gravite, s.description, s.valide, s.statut,
           s.latitude, s.longitude, s.pays, s.ville, s.quartier, s.adresse_formatee,
           (SELECT COUNT(DISTINCT COALESCE(c.visiteur_id, c.ip_utilisateur))
              FROM confirmations c
             WHERE c.signalement_id = s.id AND c.type_confirmation = 'toujours_bloquee') AS nb_confirmations
    FROM signalements s
    WHERE s.statut IN ('actif', 'incertain')
      AND s.latitude IS NOT NULL
      AND s.longitude IS NOT NULL
      AND s.latitude BETWEEN :lat_min AND :lat_max
      AND s.longitude BETWEEN :lng_min AND :lng_max
";
$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':lat_min' => $latMin,
    ':lat_max' => $latMax,
    ':lng_min' => $lngMin,
    ':lng_max' => $lngMax,
]);
$candidats = $stmt->fetchAll();

function graviteClasse($gravite) {
    return match ($gravite) {
        'Severe' => 'severe',
        'Modere' => 'modere',
        default => 'praticable',
    };
}

function graviteLabel($gravite) {
    return match ($gravite) {
        'Severe' => 'sévère',
        'Modere' => 'modéré',
        'Praticable' => 'Praticable',
        default => 'léger',
    };
}

function libelleZone($s) {
    if (!empty($s['quartier'])) return $s['quartier'];
    if (!empty($s['ville'])) return $s['ville'];
    if (!empty($s['pays'])) return $s['pays'];
    return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
}

function confianceSignalement(array $s): string {
    if ((bool) $s['valide']) return 'validee';
    if ((int) $s['nb_confirmations'] > 0) return 'confirmee_partiellement';
    if ($s['statut'] === 'incertain') return 'incertain';
    return 'recente';
}

$resultats = [];

foreach ($candidats as $s) {
    [$px, $py] = projeterEnPlanLocal((float) $s['latitude'], (float) $s['longitude'], $latDepart, $lngDepart, $kmParDegLat, $kmParDegLng);
    [$distanceKm, $t] = distanceEtPositionSurSegment($px, $py, $ax, $ay, $bx, $by);

    if ($distanceKm > CORRIDOR_KM) continue;
    if ($t < -MARGE_EXTREMITES || $t > 1 + MARGE_EXTREMITES) continue;

    $resultats[] = [
        'id' => (int) $s['id'],
        'zone' => libelleZone($s),
        'type_obstacle' => $s['type_obstacle'],
        'gravite_classe' => graviteClasse($s['gravite']),
        'gravite_label' => graviteLabel($s['gravite']),
        'description' => $s['description'],
        'confiance' => confianceSignalement($s),
        'latitude' => (float) $s['latitude'],
        'longitude' => (float) $s['longitude'],
        'distance_axe_km' => round($distanceKm, 2),
        // Position le long du trajet, en %, pour trier / afficher "à mi-chemin" etc.
        'position_pourcentage' => (int) round(max(0, min(1, $t)) * 100),
        'lien_maps' => "https://www.google.com/maps?q={$s['latitude']},{$s['longitude']}",
    ];
}

usort($resultats, fn($a, $b) => $a['position_pourcentage'] <=> $b['position_pourcentage']);

$resultats = array_slice($resultats, 0, LIMITE_RESULTATS);

echo json_encode([
    'succes' => true,
    'nb_resultats' => count($resultats),
    'corridor_km' => CORRIDOR_KM,
    'signalements' => $resultats,
]);
