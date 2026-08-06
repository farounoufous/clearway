<?php
header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app"); 
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Requête de pré-vérification CORS
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

header('Content-Type: application/json; charset=utf-8');

const RAYON_MAX_KM = 5;

const LIMITE_RESULTATS = 50;
if (!isset($_GET['lat']) || !isset($_GET['lng']) || $_GET['lat'] === '' || $_GET['lng'] === '') {
    http_response_code(400);
    echo json_encode([
        'succes' => false,
        'erreur' => "Paramètres manquants : 'lat' et 'lng' sont obligatoires.",
        'incidents' => [],
    ]);
    exit;
}
$latitudeUtilisateur = filter_var($_GET['lat'], FILTER_VALIDATE_FLOAT);
$longitudeUtilisateur = filter_var($_GET['lng'], FILTER_VALIDATE_FLOAT);

if ($latitudeUtilisateur === false || $longitudeUtilisateur === false) {
    http_response_code(400);
    echo json_encode([
        'succes' => false,
        'erreur' => "Les paramètres 'lat' et 'lng' doivent être des nombres décimaux valides.",
        'incidents' => [],
    ]);
    exit;
}
if ($latitudeUtilisateur < -90 || $latitudeUtilisateur > 90 || $longitudeUtilisateur < -180 || $longitudeUtilisateur > 180) {
    http_response_code(400);
    echo json_encode([
        'succes' => false,
        'erreur' => 'Coordonnées GPS hors des limites autorisées.',
        'incidents' => [],
    ]);
    exit;
}
require_once dirname(__DIR__) . '/config/db.php';
try {
$sql = "
    SELECT
        s.id,
        s.type_obstacle,
        s.gravite,
        s.description,
        s.latitude,
        s.longitude,
        s.pays,
        s.ville,
        s.quartier,
        s.adresse_formatee,
        s.date_creation,
        s.statut,
        s.valide,
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

$graviteClasse = function ($gravite) {
    $g = strtolower($gravite); 
    if ($g === 'severe') return 'severe';
    if ($g === 'modere') return 'modere';
    return 'severe'; 
};


    $requete = $pdo->prepare($sql);
    $requete->bindValue(':lat1', $latitudeUtilisateur, PDO::PARAM_STR);
    $requete->bindValue(':lat2', $latitudeUtilisateur, PDO::PARAM_STR);
    $requete->bindValue(':lng1', $longitudeUtilisateur, PDO::PARAM_STR);
    $requete->bindValue(':rayon', RAYON_MAX_KM, PDO::PARAM_STR);
    $requete->execute();

    $lignes = $requete->fetchAll();

    $libelleZone = function ($s) {
        if (!empty($s['quartier'])) return $s['quartier'];
        if (!empty($s['adresse_formatee'])) return $s['adresse_formatee'];
        if (!empty($s['ville'])) return $s['ville'];
        if (!empty($s['pays'])) return $s['pays'];
        return 'Position (' . round((float) $s['latitude'], 4) . ', ' . round((float) $s['longitude'], 4) . ')';
    };

    $graviteClasse = function ($gravite) {
        return match ($gravite) {
            'Severe' => 'severe',
            'Modere' => 'modere',
            default => 'praticable',
        };
    };

    $graviteLabel = function ($gravite) {
        return match ($gravite) {
            'Severe' => 'Sévère',
            'Modere' => 'Modéré',
            'Praticable' => 'Praticable',
            default => 'Léger',
        };
    };

    $confiance = function ($s) {
        if ((bool) $s['valide']) return 'validee';
        if ((int) $s['nb_confirmations'] > 0) return 'confirmee_partiellement';
        if ($s['statut'] === 'incertain') return 'incertain';
        return 'recente';
    };

    $incidents = array_map(function ($s) use ($libelleZone, $graviteClasse, $graviteLabel, $confiance) {
        return [
            'id' => (int) $s['id'],
            'zone' => $libelleZone($s),
            'type_obstacle' => $s['type_obstacle'],
            'gravite_classe' => $graviteClasse($s['gravite']),
            'gravite_label' => $graviteLabel($s['gravite']),
            'description' => $s['description'],
            'confiance' => $confiance($s),
            'latitude' => (float) $s['latitude'],
            'longitude' => (float) $s['longitude'],
            // Distance arrondie à 1 décimale
            'distance_km' => round((float) $s['distance_km'], 1),
        ];
    }, $lignes);

    echo json_encode([
        'succes' => true,
        'nb_resultats' => count($incidents),
        'rayon_km' => RAYON_MAX_KM,
        'incidents' => $incidents,
    ]);

} catch (\Throwable $e) {
    http_response_code(500);
    error_log('Erreur get_nearby_incidents.php : ' . $e->getMessage());
    echo json_encode([
        'succes' => false,
        'erreur' => 'Impossible de récupérer les voies bloquées à proximité pour le moment.',
        'incidents' => [],
    ]);
}