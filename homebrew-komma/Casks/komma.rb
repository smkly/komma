cask "komma" do
  version "0.1.0"
  sha256 "da946a0d263a8e987df415702da8f2bee1e9bab34d5f7b346754d777559d51bf"

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
