cask "komma" do
  version "0.1.0"
  sha256 "35127fc7bac24f35d1d1b886c0103cd7071be3e5baad7b319f91fbcc32f49309"

  url "https://github.com/0xSmick/komma/releases/download/v#{version}/Komma-#{version}-arm64.dmg"
  name "Komma"
  desc "AI-powered document editor for writers"
  homepage "https://github.com/0xSmick/komma"

  depends_on macos: ">= :ventura"

  app "Komma.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-cr", "#{appdir}/Komma.app"]
  end

  zap trash: [
    "~/.komma",
    "~/Library/Application Support/Komma",
    "~/Library/Preferences/com.komma.app.plist",
  ]
end
