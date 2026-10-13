Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\Projects\AG_Pet"
WshShell.Run """D:\NodeJS\node.exe"" ""d:\Projects\AG_Pet\scripts\ag-pet-service.js""", 0, False
