cask "komma" do
  version "0.3.0"
  sha256 "0896b51109cb7f21defc8aec775ee2553297042249c9592501380c145898e15e"

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
