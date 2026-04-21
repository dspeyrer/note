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
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="stylesheet" href="/style.css" />
    </head>

    <body>
        ${db.map(ent => `<div><a href="/${ent.id}">${ent.title}</a></div>`).join('\n')}
        <div><a href="${next}">(empty)</a></div>
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
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="stylesheet" href="/style.css" />
    </head>

    <body>
        <textarea autofocus="autofocus" placeholder="(empty)" spellcheck="false" autocomplete="off">${content}</textarea>
        <script>
            const editor = document.querySelector('textarea')

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
@import url('https://fonts.googleapis.com/css2?family=Ubuntu+Mono&display=swap');

html, body {
    height: 100%;
    box-sizing: border-box;
    margin: 0;
    background-color: #000;
}

body {
    padding: 0.5em;
}

* {
    color: white;
    font-family: 'Ubuntu Mono';
    font-variant-ligatures: none;
}

@media (pointer:coarse) {
    * {
        font-size: 2rem;
    }
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

/* DATA */

const icon = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAFXklEQVR4Xu2ZXYhVVRTHvTOUYPgwWTnZN5EPvkgiCIZhBT6llM3cGbsMUVbqkKbQQ2nGGFqP6g3Rq01P5dw7H+XHS4EJCkEQQRRDCBL5EaKilA/VNB+3377cI+ue2efsfc65Z8bjPQcuM/fsvdZe///6r73X7MnMaPAn0+D4Z6QEpApocAbSEmhwAaSbYFoCaQk0OANpCTS4ANJT4LYqgYGBgRXDw8Mnenp6JmyVfVsQUCwWVzQ1NX0jQJ/NZrNP2JCQeAJKpdILmUzmKw3Y3yHhMRMJiSagv7//RQB+6QPyHCQ86kdCYgmg3leXy+UhAe46YOegiH0oolu8P8/7R7xISCQBgHwJkINu8M53xnczvtn5DlEXOjo6HtaREJoAMlDCcZbPDTagg/zcCdN/mWou6jjgngHcSeHnP9ad6fZLeXzMu3fF+4vMe8g9LzQBLHAGZ/PdDiHiCGyv5n05Kli3vS14x85NArFtI7aPpN8oBPgCZLF+FuuoFwmAX0nmj5kyr1GCjPMCKqgphdAEOAsNDQ3dPz4+/hrft/OpkaJf7QUhhkyuYv7REODXYvOp2Av2kJMtdVGAFwAylSdTG8WiRRZdEwSwnBsWPM3R6+xNh4Svv8n+XXXbA/wAoYpFqOJHZw4Lh1IaZK6BzMNircpRZyIT8N2A3yfmXcXuPp1dqMBMAahxMvcHP+ap3ymFNlQgz2yjC06Z57E7HgL8q4D/zAa8mhMnAR/gf0eVgEm158cAGcwB4vOg4CH9LWw+sQUfNwF7WODtKgE9KKBChukBhDo5imKe9px3+6Fc3qBcDor32pp328WpgJvHz8TExILOzs5fTeC92luTHaTV7PbM96z52AkAxDJq97RcyGYTNLW3XiREAR+5BAqFwh0tLS3Lkd5yQL+Cwwc0gT4IAWpD9HwGBwdXopIwTc7LOP0iqOxlIIFKgCy9g/FWALeYZKnGR0ZG5nV1dV3ym6s56qxqnsy/id9CFPBWClCd3tjY2M+AvscGdHXO+2R9l2k+5dKuWmYxz+qc12x4V1hvrmk93bivAmD5W4yeNTj+hfFTfE4ShO5mRmseVvaQloM0eURa7fZeGDwJAPwIRne6DBXAdQC9GoZtx4YMZlFUKWjm6Q820h/khV3ozDs+tAQA/goT7nUmwfgGzvEDUUA7tvh2b1xWNQ/4zYDfHbXm3RgmEYA0l7Ajfy8mziHj1+sE3t3k2Nb8JhSzt56Z91QAGfqXwcqftSy6qb29XbaWoXmgdjtRUl9Q2ROP6iZVV+k8kWUvQUxSAAve7OBsGhgbRjRHllXmsVNXWupqy3kuE1OrzZq2c2IngNpdR+3K/cMKPIp5D8XI66u6g6+o3M1UvRUg/bFWmQw2mbLDKbGe8ttf7w1Pt64vARjMIuB/TAF7jefz+Zmtra1qT5HPfnzKe/uawakE76WAHxhYXI3qT4K1ant1JCDjbmQsb2acaVoSphq8FwF3M3BNAPoNEh4PowLkP4zdAg/bGhKmA7yWAPWSwE/w4zkZOJks0AxtUHVsS4ar/nVmFRKmC7wnAVUSVDO0xAfsTwT/pB8ZFgSo+8LTbHhPCz+Renvb5DjzfP8YooaXEuB3Xk79+gTAq1ZatdRBnikF76sAGTVn+UKydJxPzf/W/AhA1tuZ/2EA9FMO3poAN4je3t7ZPE9BwNdeAFGAugix7dqmBXxoAmyyalH/5/FzeHR09EAulztn4zOOOYGuxIIE0NfXt6y5udm5HB3D9pD6b01bW5s6Gm+ZJzYCbhmEhkBSApKSqbjiTBUQF7NJ8ZsqICmZiivOVAFxMZsUv6kCkpKpuOJseAX8D+8QU183+YqYAAAAAElFTkSuQmCC', 'base64')

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

    db.sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0)

    return db
};

const server = createServer({ keepAlive: true }, async (req, res) => {
    try {
        const db = await loadDb()

        const headers = {}
        let content = null

        if (req.url === '/' && req.method === 'GET') {
            const ids = db.map(ent => ent.id).sort((a, b) => a - b)

            let next = 0

            for (const id of ids)
                if (next === id)
                    next = id + 1

            content = home(db, next)
        } else if (req.url === '/style.css' && req.method === 'GET')
            content = stylesheet
        else if (req.url === '/favicon.png' && req.method === 'GET') {
            headers['Content-Type'] = 'image/png'
            content = icon
        } else {
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

                    await writeFile(join('db', `${id}.txt`), chunks)
                    content = ''
                }
            }
        }

        if (content === null) {
            res.writeHead(404)
            res.end('not found')
            return
        }

        res.writeHead(200, headers)
        res.end(content)
    } catch (err) {
        console.error(err)

        res.writeHead(500)
        res.end(err.toString())
    }
})

server.listen(80)
