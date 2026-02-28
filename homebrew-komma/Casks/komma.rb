cask "komma" do
  version "0.1.0"
  sha256 "d8cdd50cd04a6898179cade42edfa92a98835aa2e760a1d428fdc5757fe1dcac"

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
