# esp-wifi-connect (our copy)

78/esp-wifi-connect 3.3.1 (MIT, `LICENSE`), the Wi-Fi setup XiaoZhi uses: its code as published, so a later version can be compared file by file, with one fix marked `OpenCharm:` in `wifi_configuration_ap.cc` (network names escaped in the page's JSON). Only `assets/wifi_configuration.html` and `assets/wifi_configuration_done.html` are ours, in OpenCharm's design (`DESIGN.md`), making the same requests as the upstream pages. `main/idf_component.yml` points the dependency here (`override_path`). Spec 009.
