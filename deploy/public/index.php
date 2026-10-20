<?php
declare(strict_types=1);

/**
 * Forwards /mailconnect on this host to the local Node process.
 * Use this only where the vhost configuration is not writable; otherwise
 * prefer the reverse-proxy examples in deploy/. The application and its
 * secrets stay outside the document root.
 */
const MAILCONNECT_UPSTREAM = 'http://127.0.0.1:3911';

set_time_limit(180);
while (ob_get_level() > 0) {
    ob_end_clean();
}

$uri = $_SERVER['REQUEST_URI'] ?? '/mailconnect/';
$url = MAILCONNECT_UPSTREAM . $uri;
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$ch = curl_init($url);
if ($ch === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"proxy","message":"MailConnect ist nicht erreichbar."}';
    exit;
}

$headers = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lower = strtolower((string) $name);
        if (in_array($lower, ['host', 'content-length', 'connection', 'expect', 'accept-encoding'], true)) {
            continue;
        }
        $headers[] = $name . ': ' . $value;
    }
}
$hasAuth = false;
foreach ($headers as $header) {
    if (stripos($header, 'authorization:') === 0 && trim(substr($header, 14)) !== '') {
        $hasAuth = true;
        break;
    }
}
$authorization = incomingAuthorization();
if (!$hasAuth && $authorization !== '') {
    $headers[] = 'Authorization: ' . $authorization;
}
$headers[] = 'X-Forwarded-Proto: https';
$headers[] = 'X-Forwarded-Host: ' . ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost');

curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 170,
    CURLOPT_HEADER => false,
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HEADERFUNCTION => static function ($curl, string $line): int {
        $trim = trim($line);
        if ($trim === '') {
            return strlen($line);
        }
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $trim, $match) === 1) {
            http_response_code((int) $match[1]);
            return strlen($line);
        }
        $name = strtolower(strtok($trim, ':'));
        if (in_array($name, ['transfer-encoding', 'connection', 'content-length', 'content-encoding', 'keep-alive'], true)) {
            return strlen($line);
        }
        header($trim, false);
        return strlen($line);
    },
    CURLOPT_WRITEFUNCTION => static function ($curl, string $data): int {
        echo $data;
        flush();
        return strlen($data);
    },
]);

if (!in_array($method, ['GET', 'HEAD'], true)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input') ?: '');
}

$ok = curl_exec($ch);
if ($ok === false && !headers_sent()) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"proxy","message":"MailConnect ist nicht erreichbar."}';
}
curl_close($ch);

function incomingAuthorization(): string
{
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
        getenv('HTTP_AUTHORIZATION') ?: '',
        getenv('REDIRECT_HTTP_AUTHORIZATION') ?: '',
    ];
    if (function_exists('apache_request_headers')) {
        $apache = apache_request_headers();
        if (is_array($apache)) {
            foreach ($apache as $name => $value) {
                if (strcasecmp((string) $name, 'Authorization') === 0) {
                    $candidates[] = (string) $value;
                }
            }
        }
    }
    foreach ($candidates as $value) {
        if (trim($value) !== '') {
            return trim($value);
        }
    }
    return '';
}
