cask "komma" do
  version "0.1.0"
  sha256 "8911d11dbdf21335f2f601a4bd69a2d74ea0bbe3826a09729f7b2b19dbb7b763"

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
