cask "komma" do
  version "0.3.0"
  sha256 "54e34c895db70bf6339eeec05ff0265db16539642403a765427019e553778329"

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
