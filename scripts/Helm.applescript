-- Stay-open applet: handles on open events even after initial on run

on run
	launchHelm()
end run

on open theFiles
	set filePath to POSIX path of item 1 of theFiles
	do shell script "echo " & quoted form of filePath & " > /tmp/helm-open-file"

	if not helmIsRunning() then
		launchHelm()
	end if
end open

on helmIsRunning()
	try
		do shell script "pgrep -f 'dist-electron/main.js' > /dev/null 2>&1"
		return true
	on error
		return false
	end try
end helmIsRunning

on launchHelm()
	if not helmIsRunning() then
		do shell script "cd $HOME/Developer/doc-editor && /opt/homebrew/bin/npm run electron:dev > /dev/null 2>&1 &"
	end if
end launchHelm

on idle
	-- Keep applet alive to receive future on open events (stay-open applet)
	return 600
end idle
