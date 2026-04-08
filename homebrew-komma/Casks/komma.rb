cask "komma" do
  version "0.2.0"
  sha256 "884b3c1ace18b82e41e4a0e0b8c2ef331c8c8fb60df5031af7c7f0dcc3205a10"

  url "https://github.com/0xSmick/komma/releases/download/v#{version}/Komma-#{version}-universal.dmg"
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
