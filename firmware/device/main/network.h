#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

// Wi-Fi and the WebSocket to charmd (spec 009, stage 2). Wi-Fi setup is 78/esp-wifi-connect (the
// component XiaoZhi uses): with no saved network, or none found within a minute, the charm opens a
// hotspot "OpenCharm-XXXX" whose page takes the network, its password and charmd's address (in the
// page's "Custom OTA URL" field). The WebSocket runs in its own task; everything it and Wi-Fi
// report waits in a bounded queue until the main loop takes it, so the core stays single-threaded.
namespace network {

struct Event {
  enum class Kind {
    Connected,     // to charmd: send hello
    Disconnected,  // from charmd (Wi-Fi is up)
    Offline,       // no charmd possible right now; `data` is the line to show
    Text,          // a message from charmd
    Binary,        // audio from charmd (stage 3)
  };
  Kind kind = Kind::Offline;
  std::string data;
};

// Starts Wi-Fi (setup hotspot or the saved network). `token` gives the pairing token to send at
// each connection (empty before pairing).
void start(std::function<std::string()> token);
// The next event, if any (non-blocking).
bool poll(Event& out);
void send_text(const std::string& json);
void send_binary(const uint8_t* data, size_t size);
// Drops the connection and connects again: after "revoked" (the token erased) and after pairing
// (so every later connection carries the new token).
void reconnect();
// Opens the setup hotspot now (the key held on the connecting screen).
void open_wifi_setup();

// Where this charm is connected now, as scheme, host and port ("wss://charm.example.com"; "" when
// not connected): a token charmd issues is bound to it (DeviceHal) and never sent anywhere else,
// not even to the same host without TLS.
std::string connected_origin();

// For the status screen.
std::string wifi_name();  // empty when not on Wi-Fi
int wifi_rssi();          // dBm, or charm::kUnknown
std::string charmd_host();
bool connected();

}  // namespace network
