cask "komma" do
  version "0.1.0"
  sha256 "32c71dfe763d32425201c84f032b6b9bf0b2a579cbfe920a61dc3679c7f83c39"

  url "https://github.com/0xSmick/komma/releases/download/v#{version}/Komma-#{version}-arm64.dmg"
  name "Komma"
  desc "AI-powered document editor for writers"
  homepage "https://github.com/0xSmick/komma"

  depends_on macos: ">= :ventura"

  app "Komma.app"

  zap trash: [
    "~/.komma",
    "~/Library/Application Support/Komma",
    "~/Library/Preferences/com.komma.app.plist",
  ]
end
