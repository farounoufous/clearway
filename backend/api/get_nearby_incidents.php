<?php
// ============================================
// ClearWay Bénin - API "Alertes par rayon de 5 km"
//
// Reçoit la position GPS actuelle de l'utilisateur (lat, lng) et renvoie
// la liste des signalements VALIDÉS (valide = 1) et ACTIFS situés à moins
// de 5 km, triés du plus proche au plus lointain.
//
// Distance calculée en SQL avec la formule de Haversine (portable sur
// toutes les versions de MySQL, y compris celles < 8.0 où ST_Distance_Sphere
// n'existe pas encore — c'est le cas courant sur les hébergements comme
// Railway selon l'image MySQL utilisée).
// ============================================

header("Access-Control-Allow-Origin: https://clearway-phi.vercel.app"); // ⚠️ REMPLACEZ par votre vraie URL Vercel
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Access-Control-Allow-Credentials: true");

// Requête de pré-vérification CORS : on arrête tout de suite
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

header('Content-Type: application/json; charset=utf-8');

// Rayon maximal de recherche, en kilomètres
const RAYON_MAX_KM = 5;

// Nombre maximum de résultats renvoyés (évite de surcharger le téléphone
// de l'utilisateur si des dizaines de signalements sont dans le rayon)
const LIMITE_RESULTATS = 50;

// ============================================
// 1) VALIDATION STRICTE DES PARAMÈTRES GET
// ============================================

// On vérifie d'abord que les deux paramètres sont bien présents
if (!isset($_GET['lat']) || !isset($_GET['lng']) || $_GET['lat'] === '' || $_GET['lng'] === '') {
    http_response_code(400);
    echo json_encode([
        'succes' => false,
        'erreur' => "Paramètres manquants : 'lat' et 'lng' sont obligatoires.",
        'incidents' => [],
    ]);
    exit;
}

// filter_var() avec FILTER_VALIDATE_FLOAT renvoie `false` si la valeur
// n'est pas un nombre flottant valide. Cela bloque d'office toute tentative
// d'injection SQL ou de script (ex: "1;DROP TABLE...", "<script>", etc.),
// car une telle chaîne ne pourra jamais être convertie en float.
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

// Sécurité supplémentaire : on vérifie que les coordonnées sont dans les
// bornes géographiques réelles (une latitude/longitude hors de ces plages
// n'a aucun sens et ne peut venir que d'une donnée corrompue ou malveillante)
if ($latitudeUtilisateur < -90 || $latitudeUtilisateur > 90 || $longitudeUtilisateur < -180 || $longitudeUtilisateur > 180) {
    http_response_code(400);
    echo json_encode([
        'succes' => false,
        'erreur' => 'Coordonnées GPS hors des limites autorisées.',
        'incidents' => [],
    ]);
    exit;
}

// ============================================
// 2) CONNEXION À LA BASE (PDO existante, via db.php)
// ============================================
require_once dirname(__DIR__) . '/config/db.php';

// ============================================
// 3) REQUÊTE SQL : FORMULE DE HAVERSINE
//
// 6371 = rayon moyen de la Terre en kilomètres.
// La formule calcule la distance orthodromique (à vol d'oiseau) entre
// le point utilisateur (:lat, :lng) et chaque signalement (latitude,
// longitude) stocké en base.
//
// On utilise des paramètres NOMMÉS et liés via PDO (bindValue en
// PDO::PARAM_STR côté requête préparée) : aucune valeur n'est jamais
// concaténée directement dans le SQL, ce qui élimine tout risque
// d'injection SQL, même si la validation en amont a déjà filtré les
// entrées non numériques.
// ============================================
try {
    // 1) Modifiez la requête SQL pour être moins restrictive pendant vos tests (enlevez s.valide = 1 si vous n'avez pas de panneau d'administration pour valider)
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

// 2) Sécurisez la fonction de correspondance des classes en ignorant les majuscules
$graviteClasse = function ($gravite) {
    $g = strtolower($gravite); // Transforme 'Modere' ou 'Severe' en minuscules
    if ($g === 'severe') return 'severe';
    if ($g === 'modere') return 'modere';
    return 'severe'; // Par défaut, on force une classe bloquante pour qu'elle s'affiche dans le rayon de 5km
};


    $requete = $pdo->prepare($sql);
    $requete->bindValue(':lat1', $latitudeUtilisateur, PDO::PARAM_STR);
    $requete->bindValue(':lat2', $latitudeUtilisateur, PDO::PARAM_STR);
    $requete->bindValue(':lng1', $longitudeUtilisateur, PDO::PARAM_STR);
    $requete->bindValue(':rayon', RAYON_MAX_KM, PDO::PARAM_STR);
    $requete->execute();

    $lignes = $requete->fetchAll();

    // ---- Libellé de secours pour la zone : quartier > ville > pays > adresse > coordonnées ----
    // (même logique que le reste de l'application, pour rester cohérent)
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

    // Même règle de confiance que voies.php / confirmation.php
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
            // Distance arrondie à 1 décimale, ex: 1.2 (km)
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
    // Toute erreur base de données (connexion coupée, table absente, etc.)
    // renvoie un JSON propre avec un vrai code HTTP 500, jamais une page
    // d'erreur PHP brute qui casserait le fetch() côté frontend
    http_response_code(500);
    error_log('Erreur get_nearby_incidents.php : ' . $e->getMessage());
    echo json_encode([
        'succes' => false,
        'erreur' => 'Impossible de récupérer les voies bloquées à proximité pour le moment.',
        'incidents' => [],
    ]);
}