import { createServer } from 'http';
import { readdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'

/* HTML */

const home = (db, next) => `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">

    <head>
        <meta charset="utf-8" />
        <title>Notepad</title>
        <link rel="icon" type="image/x-icon" href="data:image/png;base64," />
        <link rel="stylesheet" href="/style.css" />
    </head>

    <body>
        ${db.map(ent => `<a href="/${ent.id}">${ent.title}</a>`).join('\n')}
        <a href="${next}">(empty)</a>
        <script>
            window.addEventListener('pageshow', ev => {
                if (event.persisted)
                    window.location.reload();
            })
        </script>
    </body>

</html>`;

const editor = content => `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">

    <head>
        <meta charset="utf-8" />
        <title>Notepad</title>
        <link rel="icon" type="image/x-icon" href="data:image/png;base64," />
        <link rel="stylesheet" href="/style.css" />
    </head>

    <body>
        <textarea autofocus="autofocus" placeholder="(empty)" spellcheck="false" autocomplete="off">${content}</textarea>
        <script>
            const editor = document.querySelector('textarea')
            editor.setSelectionRange(editor.value.length, editor.value.length)

            let controller = null
            let editTout = null

            const blockUnload = ev => {
                ev.preventDefault()
                ev.returnValue = true
            }

            editor.addEventListener('input', () => {
                if (editTout !== null)
                    clearTimeout(editTout)

                window.addEventListener('beforeunload', blockUnload)
                
                editTout = setTimeout(async () => {
                    editTout = null
                    if (controller !== null)
                        controller.abort()

                    controller = new AbortController()

                    await fetch('', {
                        method: 'PUT',
                        body: editor.value,
                        signal: controller.signal
                    })

                    controller = null
                    window.removeEventListener('beforeunload', blockUnload)
                }, 500)
            })
        </script>
    </body>

</html>`;

/* CSS */

const stylesheet = `
html,
    body {
    height: 100%;
    box-sizing: border-box;
    margin: 0;
    background-color: #000;
    padding: 0.5em;
}

* {
    color: white;
    font-family: 'Iosevka';
    font-size: 1em;
    font-variant-ligatures: none;
}

textarea {
    background-color: transparent;
    height: 100%;
    box-sizing: border-box;
    border: none;
    outline: none;
    resize: none;
    border-radius: 0px;
    width: 100%;
    padding: 0;
    overflow-y: scroll;
}

textarea::selection {
    background-color: #666;
}`;

const loadDb = async () => {
    const db = []
    const files = await readdir('db')

    const jobs = []

    for (const name of files) {
        jobs.push((async () => {
            const idMatch = name.match(/^(\d+).txt$/)
            if (idMatch === null) return

            const id = parseInt(idMatch[1])

            const path = join('db', name)

            const raw = await readFile(path, 'utf-8')

            const content = raw.trim();

            if (content === '') {
                await rm(path)
                return
            }

            let eol = content.indexOf('\n')
            if (eol === -1) eol = content.length

            const title = content.slice(0, eol)

            db.push({
                id,
                title,
                content,
            });
        })())
    }

    await Promise.all(jobs)

    return db.sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
};

const server = createServer({ keepAlive: true }, async (req, res) => {
    try {
        const db = await loadDb()

        let content = null

        if (req.url === '/' && req.method === 'GET') {
            const sorted = db.map(ent => ent.id).sort()

            let next = 0

            for (const id of sorted)
                if (next === id)
                    next = id + 1

            content = home(db, next)
        } else if (req.url === '/style.css' && req.method === 'GET')
            content = stylesheet
        else {
            const match = req.url.match(/^\/(\d+)$/)

            if (match !== null) {
                const id = parseInt(match[1])

                if (req.method === 'GET') {
                    const dbi = db.findIndex(ent => ent.id === id)
                    const value = dbi === -1 ? '' : db[dbi].content

                    content = editor(value)
                } else if (req.method === 'PUT') {
                    const chunks = [];

                    for await (const chunk of req)
                        chunks.push(Buffer.from(chunk));

                    await writeFile(`db/${id}.txt`, chunks)
                    content = ''
                }
            }
        }

        if (content === null) {
            res.writeHead(404)
            res.end('not found')
            return
        }

        res.writeHead(200)
        res.end(content)
    } catch (err) {
        console.error(err)

        res.writeHead(500)
        res.end(err.toString())
    }
})

server.listen(80)
